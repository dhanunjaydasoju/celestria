import { describe, expect, it } from 'vitest'
import { ANSWER_TESTA_B, fail, fixtureContext, json, scriptedClient, testConfig } from '../ai/__fixtures__/fakeProvider.js'
import { createLimiter } from '../ai/limits.js'
import { createAstronomer } from '../ai/orchestrator.js'
import { createApp } from '../app.js'

const KEY = 'route-test-key-0123456789'

async function withServer(script, limits, fn, { configured = true } = {}) {
  const config = { ...testConfig(limits), configured }
  const tc = fixtureContext()
  const astronomer = createAstronomer({ config, client: scriptedClient(script), limiter: createLimiter(config.limits), getToolContext: () => tc })
  const app = createApp({ store: { get: () => null }, ai: { astronomer, config } })
  const server = app.listen(0)
  const base = `http://localhost:${server.address().port}/api`
  const post = (body) => fetch(`${base}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    await fn({ base, post })
  } finally {
    server.close()
  }
}

describe('POST /api/ask', () => {
  it('answers with a validated response and no-store caching', async () => {
    await withServer([json(ANSWER_TESTA_B)], {}, async ({ post }) => {
      const res = await post({ question: 'Tell me about Testa b' })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const body = await res.json()
      expect(body).toMatchObject({ status: 'answered', links: [{ profileUrl: '/planet/testa-b' }] })
    })
  })

  it('returns contract errors for bad input, rate limits and provider failures', async () => {
    await withServer([fail('auth', false)], { AI_RATE_LIMIT_PER_MINUTE: 1 }, async ({ post }) => {
      const bad = await post({ question: '' }) // invalid input is refused before it counts
      expect(bad.status).toBe(400)
      expect(await bad.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Ask a question.' } })
      const provider = await post({ question: 'Tell me about Testa b' })
      expect(provider.status).toBe(502)
      expect((await provider.json()).error.code).toBe('PROVIDER_ERROR')
      const limited = await post({ question: 'Tell me about Testa b' })
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await limited.json()).error.code).toBe('RATE_LIMITED')
    })
  })

  it('reports budget exhaustion with 503', async () => {
    await withServer([json(ANSWER_TESTA_B)], { AI_DAILY_REQUEST_BUDGET: 1 }, async ({ post }) => {
      expect((await post({ question: 'Tell me about Testa b' })).status).toBe(200)
      const res = await post({ question: 'Tell me about Solo b' })
      expect(res.status).toBe(503)
      expect((await res.json()).error.code).toBe('BUDGET_EXHAUSTED')
    })
  })

  it('is unavailable without a configured key, and status says so', async () => {
    await withServer([], {}, async ({ base, post }) => {
      const res = await post({ question: 'hi' })
      expect(res.status).toBe(503)
      expect((await res.json()).error.code).toBe('AI_UNAVAILABLE')
      expect(await (await fetch(`${base}/ask/status`)).json()).toEqual({ available: false, model: null })
    }, { configured: false })
  })

  it('never exposes the API key in any response', async () => {
    const { loadAiConfig } = await import('../ai/config.js')
    const real = loadAiConfig({ FEATHERLESS_API_KEY: KEY })
    const app = createApp({ store: { get: () => null }, ai: { astronomer: null, config: real } })
    const server = app.listen(0)
    try {
      const base = `http://localhost:${server.address().port}/api`
      for (const res of [await fetch(`${base}/ask/status`), await fetch(`${base}/ask`, { method: 'POST' })]) {
        expect(await res.text()).not.toContain(KEY)
      }
    } finally {
      server.close()
    }
  })
})
