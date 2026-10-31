import { describe, expect, it } from 'vitest'
import { testConfig } from './__fixtures__/fakeProvider.js'
import { createLimiter, LimitError } from './limits.js'

const clock = (start = Date.parse('2026-10-31T12:00:00Z')) => {
  let t = start
  return { now: () => t, advance: (ms) => (t += ms) }
}
const limiter = (limits, c = clock()) => createLimiter(testConfig(limits).limits, { now: c.now })
const code = (fn) => {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(LimitError)
    return err.code
  }
  return null
}
const rejection = async (p) => p.then(() => null, (err) => err.code)

describe('per-client rate limits', () => {
  it('limits requests per minute per client, then frees the window', () => {
    const c = clock()
    const l = limiter({ AI_RATE_LIMIT_PER_MINUTE: 2 }, c)
    l.checkClient('a')
    l.checkClient('a')
    expect(code(() => l.checkClient('a'))).toBe('RATE_LIMITED')
    expect(code(() => l.checkClient('b'))).toBeNull() // independent per client
    c.advance(60_001)
    expect(code(() => l.checkClient('a'))).toBeNull()
  })

  it('limits requests per UTC day and resets at midnight, with Retry-After', () => {
    const c = clock(Date.parse('2026-10-31T23:59:00Z'))
    const l = limiter({ AI_RATE_LIMIT_PER_DAY: 1 }, c)
    l.checkClient('a')
    let err
    try {
      l.checkClient('a')
    } catch (e) {
      err = e
    }
    expect(err).toMatchObject({ code: 'DAILY_LIMIT', status: 429, retryAfterS: 60 })
    c.advance(61_000)
    expect(code(() => l.checkClient('a'))).toBeNull()
  })
})

describe('global budgets', () => {
  it('admits at most the daily question budget', async () => {
    const l = limiter({ AI_DAILY_REQUEST_BUDGET: 2, AI_MAX_CONCURRENCY: 8 })
    ;(await l.admit()).release()
    ;(await l.admit()).release()
    expect(await rejection(l.admit())).toBe('BUDGET_EXHAUSTED')
  })

  it('reserves spend per call, settles with the reported cost, and stops at the limit', async () => {
    const l = limiter({ AI_DAILY_SPEND_LIMIT_USD: 0.004, AI_COST_RESERVE_PER_CALL_USD: 0.002 })
    const t = await l.admit()
    t.reserveCall()
    expect(l.state().reserved).toBeCloseTo(0.002)
    t.settleCall(0.001)
    expect(l.state()).toMatchObject({ reserved: 0 })
    expect(l.state().spentToday).toBeCloseTo(0.001)
    t.reserveCall()
    t.settleCall(null) // no reported cost: the reserve counts as spent
    expect(l.state().spentToday).toBeCloseTo(0.003)
    expect(code(() => t.reserveCall())).toBe('SPEND_EXHAUSTED') // 0.003 spent + 0.002 reserve > 0.004
  })

  it('refuses new questions once spending has no headroom', async () => {
    const l = limiter({ AI_DAILY_SPEND_LIMIT_USD: 0.002, AI_COST_RESERVE_PER_CALL_USD: 0.002 })
    const t = await l.admit()
    t.reserveCall()
    t.settleCall(0.0015)
    t.release()
    expect(await rejection(l.admit())).toBe('SPEND_EXHAUSTED')
  })

  it('a reserve held while another call runs blocks overspending', async () => {
    const l = limiter({ AI_DAILY_SPEND_LIMIT_USD: 0.003, AI_COST_RESERVE_PER_CALL_USD: 0.002, AI_MAX_CONCURRENCY: 2 })
    const a = await l.admit()
    const b = await l.admit()
    a.reserveCall()
    expect(code(() => b.reserveCall())).toBe('SPEND_EXHAUSTED')
  })
})

describe('concurrency', () => {
  it('queues beyond the concurrency limit and admits in order on release', async () => {
    const l = limiter({ AI_MAX_CONCURRENCY: 1, AI_MAX_QUEUE: 2 })
    const first = await l.admit()
    const order = []
    const second = l.admit().then((t) => (order.push('second'), t))
    const third = l.admit().then((t) => (order.push('third'), t))
    expect(l.state()).toMatchObject({ active: 1, queued: 2 })
    expect(await rejection(l.admit())).toBe('BUSY') // queue full
    first.release()
    ;(await second).release()
    ;(await third).release()
    expect(order).toEqual(['second', 'third'])
    expect(l.state()).toMatchObject({ active: 0, queued: 0, questionsToday: 3 })
  })

  it('times out queued requests and frees cancelled ones', async () => {
    const l = limiter({ AI_MAX_CONCURRENCY: 1, AI_MAX_QUEUE: 2, AI_QUEUE_TIMEOUT_MS: 20 })
    const held = await l.admit()
    expect(await rejection(l.admit())).toBe('BUSY')
    const controller = new AbortController()
    const waiting = rejection(l.admit(controller.signal))
    controller.abort()
    expect(await waiting).toBe('BUSY')
    expect(l.state().queued).toBe(0)
    held.release()
    expect(l.state().active).toBe(0)
  })

  it('a burst of simultaneous requests cannot exceed concurrency, queue or budget', async () => {
    const l = limiter({ AI_MAX_CONCURRENCY: 2, AI_MAX_QUEUE: 3, AI_DAILY_REQUEST_BUDGET: 4 })
    const outcomes = Array.from({ length: 20 }, () => {
      const o = { state: 'pending' }
      o.promise = l.admit().then((t) => Object.assign(o, { state: 'admitted', ticket: t }), (err) => Object.assign(o, { state: err.code }))
      return o
    })
    await new Promise((r) => setTimeout(r, 0))
    const count = (s) => outcomes.filter((o) => o.state === s).length
    expect(count('admitted')).toBe(2)
    expect(count('BUSY')).toBe(15)
    expect(count('pending')).toBe(3)
    expect(l.state()).toMatchObject({ active: 2, queued: 3, questionsToday: 2 })

    // Releasing admits queued requests, but never beyond the daily budget.
    const releaseAdmitted = () => outcomes.filter((x) => x.state === 'admitted' && !x.released).forEach((o) => (o.released = true, o.ticket.release()))
    releaseAdmitted()
    await new Promise((r) => setTimeout(r, 0))
    expect(count('admitted')).toBe(4)
    expect(l.state()).toMatchObject({ questionsToday: 4, active: 2, queued: 1 })
    releaseAdmitted() // the last queued request now finds the budget spent
    await Promise.all(outcomes.map((o) => o.promise))
    expect(count('BUDGET_EXHAUSTED')).toBe(1)
    expect(l.state()).toMatchObject({ questionsToday: 4, queued: 0 })
  })

  it('release is idempotent', async () => {
    const l = limiter({ AI_MAX_CONCURRENCY: 1 })
    const t = await l.admit()
    t.release()
    t.release()
    expect(l.state().active).toBe(0)
  })
})
