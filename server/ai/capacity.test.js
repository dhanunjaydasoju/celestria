import { describe, expect, it } from 'vitest'
import { ANSWER_TESTA_B, FALLBACK, PRIMARY, fixtureContext, json, sleep, testConfig } from './__fixtures__/fakeProvider.js'
import { CAPACITY_CODE, COOLDOWN_MS, createCapacityCooldown } from './capacity.js'
import { ProviderError } from './featherless.js'
import { createLimiter } from './limits.js'
import { createAstronomer } from './orchestrator.js'

// ── The state machine ──────────────────────────────────────────────────────
describe('createCapacityCooldown', () => {
  const setup = () => {
    let t = 1_000_000
    const c = createCapacityCooldown({ now: () => t })
    return { c, advance: (ms) => (t += ms) }
  }

  it('uses the primary model normally', () => {
    const { c } = setup()
    expect(c.choose()).toEqual({ usePrimary: true, probe: false })
    expect(c.choose()).toEqual({ usePrimary: true, probe: false })
    expect(COOLDOWN_MS).toBe(180_000)
  })

  it('skips the primary model for 3 minutes after capacity_exhausted', () => {
    const { c, advance } = setup()
    c.capacity()
    expect(c.choose()).toEqual({ usePrimary: false, probe: false })
    advance(COOLDOWN_MS - 1)
    expect(c.choose()).toEqual({ usePrimary: false, probe: false })
  })

  it('after expiry lets exactly one question probe; others stay on the fallback', () => {
    const { c, advance } = setup()
    c.capacity()
    advance(COOLDOWN_MS)
    expect(c.choose()).toEqual({ usePrimary: true, probe: true })
    expect(c.choose()).toEqual({ usePrimary: false, probe: false }) // concurrent question while the probe runs
    expect(c.state().probing).toBe(true)
  })

  it('a successful probe ends the cooldown', () => {
    const { c, advance } = setup()
    c.capacity()
    advance(COOLDOWN_MS)
    c.choose()
    c.succeeded()
    expect(c.choose()).toEqual({ usePrimary: true, probe: false })
    expect(c.state()).toEqual({ coolingDown: false, until: null, probing: false })
  })

  it('a probe that hits capacity again restarts the full cooldown', () => {
    const { c, advance } = setup()
    c.capacity()
    advance(COOLDOWN_MS)
    c.choose()
    c.capacity()
    expect(c.choose().usePrimary).toBe(false)
    advance(COOLDOWN_MS - 1)
    expect(c.choose().usePrimary).toBe(false)
    advance(1)
    expect(c.choose()).toEqual({ usePrimary: true, probe: true })
  })

  it('a probe that ends without a verdict lets the next question probe', () => {
    const { c, advance } = setup()
    c.capacity()
    advance(COOLDOWN_MS)
    c.choose()
    c.released()
    expect(c.choose()).toEqual({ usePrimary: true, probe: true })
  })
})

// ── Through the orchestrator ───────────────────────────────────────────────
const capacityError = () => new ProviderError('provider_error', 'Provider error: at capacity', { retryable: true, status: 200, providerCode: CAPACITY_CODE })

/** A provider whose behaviour per model can be changed between questions. */
function provider() {
  const requests = []
  const mode = { [PRIMARY]: 'ok', [FALLBACK]: 'ok' }
  const delay = { [PRIMARY]: 0, [FALLBACK]: 0 }
  return {
    requests,
    mode,
    delay,
    async chat(req) {
      requests.push(req.model)
      if (delay[req.model]) await sleep(delay[req.model])
      const m = mode[req.model]
      if (m === 'capacity') throw capacityError()
      if (m === 'upstream') throw new ProviderError('upstream', 'Featherless HTTP 503', { retryable: true, status: 503 })
      if (m === 'timeout') throw new ProviderError('timeout', 'No response', { retryable: true })
      if (m === 'other_code') throw new ProviderError('provider_error', 'Provider error: other', { retryable: true, status: 200, providerCode: 'model_overloaded' })
      return json(ANSWER_TESTA_B)
    },
  }
}

function setup(limits = {}) {
  let t = 5_000_000
  const config = testConfig(limits)
  const client = provider()
  const logs = []
  const tc = fixtureContext()
  const astronomer = createAstronomer({ config, client, limiter: createLimiter(config.limits), getToolContext: () => tc, log: (e) => logs.push(e), now: () => t })
  let n = 0
  // A different question each time, so the answer cache never short-circuits.
  const ask = (extra = {}) => astronomer.ask({ question: `Tell me about Testa b (${++n})`, clientKey: `c${n}`, ...extra })
  return { client, logs, ask, advance: (ms) => (t += ms), lastLog: () => logs.filter((e) => e.event === 'ask').at(-1) }
}

describe('orchestrator: primary-model capacity cooldown', () => {
  it('uses Qwen3-32B normally', async () => {
    const { client, ask } = setup()
    const r = await ask()
    expect(r).toMatchObject({ status: 'answered', model: PRIMARY, fallbackUsed: false })
    expect(client.requests).toEqual([PRIMARY])
  })

  it('on capacity_exhausted falls back to Qwen3-14B at once and starts the cooldown', async () => {
    const { client, ask, lastLog } = setup()
    client.mode[PRIMARY] = 'capacity'
    const r = await ask()
    expect(r).toMatchObject({ status: 'answered', model: FALLBACK, fallbackUsed: true })
    expect(client.requests).toEqual([PRIMARY, FALLBACK])
    expect(lastLog().providerErrors).toEqual([{ model: PRIMARY, code: 'provider_error', providerCode: CAPACITY_CODE }])
  })

  it('skips Qwen3-32B for the next 3 minutes, server-wide', async () => {
    const { client, ask, advance, lastLog } = setup()
    client.mode[PRIMARY] = 'capacity'
    await ask()
    client.requests.length = 0
    client.mode[PRIMARY] = 'ok' // even if capacity came back, it is not tried yet
    const progress = []
    advance(60_000)
    const r = await ask({ onProgress: (e) => progress.push(e) })
    expect(r).toMatchObject({ model: FALLBACK, fallbackUsed: true })
    expect(client.requests).toEqual([FALLBACK]) // no ~11 s wasted on the primary
    expect(progress).toContainEqual(expect.objectContaining({ stage: 'fallback', from: PRIMARY, to: FALLBACK, reason: 'cooldown' }))
    expect(lastLog()).toMatchObject({ primarySkipped: true, providerErrors: [] })
    advance(COOLDOWN_MS - 60_000 - 1)
    await ask()
    expect(client.requests).toEqual([FALLBACK, FALLBACK])
  })

  it('after 3 minutes probes Qwen3-32B again; success restores it for everyone', async () => {
    const { client, ask, advance } = setup()
    client.mode[PRIMARY] = 'capacity'
    await ask()
    client.mode[PRIMARY] = 'ok'
    advance(COOLDOWN_MS)
    client.requests.length = 0
    const probe = await ask()
    expect(probe).toMatchObject({ model: PRIMARY, fallbackUsed: false })
    await ask()
    expect(client.requests).toEqual([PRIMARY, PRIMARY])
  })

  it('a probe that hits capacity again restarts the cooldown', async () => {
    const { client, ask, advance } = setup()
    client.mode[PRIMARY] = 'capacity'
    await ask()
    advance(COOLDOWN_MS)
    client.requests.length = 0
    const probe = await ask()
    expect(client.requests).toEqual([PRIMARY, FALLBACK])
    expect(probe.model).toBe(FALLBACK)
    client.requests.length = 0
    advance(COOLDOWN_MS - 1)
    await ask()
    expect(client.requests).toEqual([FALLBACK]) // the new cooldown counts from the failed probe
  })

  it('unrelated errors fall back for that question only and never start a cooldown', async () => {
    for (const kind of ['upstream', 'timeout', 'other_code']) {
      const { client, ask } = setup()
      client.mode[PRIMARY] = kind
      const r = await ask()
      expect(r, kind).toMatchObject({ model: FALLBACK, fallbackUsed: true })
      client.mode[PRIMARY] = 'ok'
      client.requests.length = 0
      await ask()
      expect(client.requests, kind).toEqual([PRIMARY])
    }
  })

  it('keeps the one-fallback rule: a failing fallback during cooldown is not retried on Qwen3-32B', async () => {
    const { client, ask } = setup()
    client.mode[PRIMARY] = 'capacity'
    await ask()
    client.mode[FALLBACK] = 'upstream'
    client.requests.length = 0
    await expect(ask()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(client.requests).toEqual([FALLBACK])
  })

  it('under concurrency only one question probes; the others use Qwen3-14B', async () => {
    const { client, ask, advance } = setup({ AI_MAX_CONCURRENCY: 3 })
    client.mode[PRIMARY] = 'capacity'
    await ask()
    advance(COOLDOWN_MS)
    client.mode[PRIMARY] = 'ok'
    client.delay[PRIMARY] = 40 // the probe is still running when the others start
    client.requests.length = 0
    const results = await Promise.all([ask(), ask(), ask()])
    expect(results.map((r) => r.model).sort()).toEqual([FALLBACK, FALLBACK, PRIMARY])
    expect(client.requests.filter((m) => m === PRIMARY)).toHaveLength(1)
    client.requests.length = 0
    await ask()
    expect(client.requests).toEqual([PRIMARY]) // the successful probe restored it
  })

  it('a probe cancelled before a verdict lets the next question probe', async () => {
    const { client, ask, advance } = setup()
    client.mode[PRIMARY] = 'capacity'
    await ask()
    advance(COOLDOWN_MS)
    client.mode[PRIMARY] = 'ok'
    client.delay[PRIMARY] = 200
    const ac = new AbortController()
    const cancelled = ask({ signal: ac.signal }).catch((e) => e)
    await sleep(20)
    ac.abort()
    await cancelled
    client.delay[PRIMARY] = 0
    client.requests.length = 0
    const r = await ask()
    expect(r.model).toBe(PRIMARY)
    expect(client.requests).toEqual([PRIMARY])
  })
})
