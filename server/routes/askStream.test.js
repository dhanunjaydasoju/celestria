// API integration: the browser client (src/services/astronomerClient.js)
// against a real Express server and orchestrator, with a scripted provider.
import { describe, expect, it } from 'vitest'
import { getAskStatus, streamAsk } from '../../src/services/astronomerClient.js'
import { ANSWER_TESTA_B, BAD_ANSWER, fail, fixtureContext, json, scriptedClient, sleep, testConfig, toolCalls } from '../ai/__fixtures__/fakeProvider.js'
import { createLimiter } from '../ai/limits.js'
import { createAstronomer } from '../ai/orchestrator.js'
import { createApp } from '../app.js'

async function withServer(script, limits, fn, { configured = true } = {}) {
  const config = { ...testConfig(limits), configured }
  const tc = fixtureContext()
  const client = scriptedClient(script)
  const astronomer = createAstronomer({ config, client, limiter: createLimiter(config.limits), getToolContext: () => tc })
  const server = createApp({ store: { get: () => null }, ai: { astronomer, config } }).listen(0)
  const baseUrl = `http://localhost:${server.address().port}`
  try {
    await fn({ baseUrl, client })
  } finally {
    server.closeAllConnections?.()
    server.close()
  }
}
const errorOf = (p) => p.then(() => null, (e) => e)

describe('streamed /api/ask through the browser client', () => {
  it('delivers confirmed progress stages in order, then the validated result', async () => {
    await withServer([toolCalls(['get_system', { host: 'Testa' }]), json(ANSWER_TESTA_B)], {}, async ({ baseUrl }) => {
      const stages = []
      const result = await streamAsk({ question: 'Tell me about Testa b', planetId: 'testa-b' }, { baseUrl, onProgress: (e) => stages.push(e.stage) })
      expect(stages).toEqual(['admitted', 'retrieved', 'model', 'tools', 'model', 'validating'])
      expect(result).toMatchObject({ status: 'answered', links: [{ profileUrl: '/planet/testa-b' }] })
    })
  })

  it('reports repairs and never streams the rejected answer', async () => {
    await withServer([json(BAD_ANSWER), json(ANSWER_TESTA_B)], {}, async ({ baseUrl }) => {
      const events = []
      const result = await streamAsk({ question: 'Tell me about Testa b' }, { baseUrl, onProgress: (e) => events.push(e) })
      expect(events.map((e) => e.stage)).toEqual(['admitted', 'retrieved', 'model', 'validating', 'repair', 'model', 'validating'])
      expect(events.find((e) => e.stage === 'repair')).toMatchObject({ attempt: 1, issues: ['number'] })
      expect(JSON.stringify(events) + JSON.stringify(result)).not.toContain('2500')
    })
  })

  it('reports the fallback switch as a stage', async () => {
    await withServer([fail('timeout'), json(ANSWER_TESTA_B)], {}, async ({ baseUrl }) => {
      const events = []
      const result = await streamAsk({ question: 'Tell me about Testa b' }, { baseUrl, onProgress: (e) => events.push(e) })
      expect(events.find((e) => e.stage === 'fallback')).toMatchObject({ to: 'Qwen/Qwen3-14B', reason: 'timeout' })
      expect(result.fallbackUsed).toBe(true)
    })
  })

  it('passes page context (system and comparison) to retrieval', async () => {
    await withServer([json(ANSWER_TESTA_B)], {}, async ({ baseUrl, client }) => {
      const events = []
      await streamAsk({ question: 'What is here?', host: 'Testa', compareIds: ['testa-b', 'solo-b'] }, { baseUrl, onProgress: (e) => events.push(e) })
      expect(events.find((e) => e.stage === 'retrieved').tools.map((t) => t.label)).toEqual(['NASA record: Testa b', 'NASA record: Solo b', 'System: Testa'])
      expect(client.requests[0].messages.find((m) => m.role === 'user').content).toMatch(/comparing: Testa b, Solo b/)
    })
  })

  it('maps limits, timeouts and provider failures to typed client errors', async () => {
    await withServer([fail('auth', false)], { AI_RATE_LIMIT_PER_MINUTE: 1 }, async ({ baseUrl }) => {
      expect(await errorOf(streamAsk({ question: 'Tell me about Testa b' }, { baseUrl }))).toMatchObject({ code: 'PROVIDER_ERROR', status: 502 })
      expect(await errorOf(streamAsk({ question: 'Tell me about Testa b' }, { baseUrl }))).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterS: expect.any(Number) })
    })
    await withServer([(req) => sleep(5000, req.signal)], { AI_REQUEST_TIMEOUT_MS: 200 }, async ({ baseUrl }) => {
      expect(await errorOf(streamAsk({ question: 'Tell me about Testa b' }, { baseUrl }))).toMatchObject({ code: 'TIMEOUT', status: 504 })
    })
    await withServer([], { AI_DAILY_REQUEST_BUDGET: 1 }, async ({ baseUrl }) => {
      await streamAsk({ question: 'Tell me about Testa b' }, { baseUrl })
      expect(await errorOf(streamAsk({ question: 'Tell me about Solo b' }, { baseUrl }))).toMatchObject({ code: 'BUDGET_EXHAUSTED', status: 503 })
    })
  })

  it('handles an unconfigured server and reports it via status', async () => {
    await withServer([], {}, async ({ baseUrl }) => {
      expect(await errorOf(streamAsk({ question: 'hi' }, { baseUrl }))).toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 })
      expect(await getAskStatus({ baseUrl })).toEqual({ available: false, model: null })
    }, { configured: false })
    expect(await getAskStatus({ baseUrl: 'http://localhost:1' })).toEqual({ available: false, model: null })
  })

  it('cancels from the browser side and the server stops the model call', async () => {
    let aborted = false
    const hang = (req) => sleep(5000, req.signal).catch((e) => ((aborted = true), Promise.reject(e)))
    await withServer([hang], {}, async ({ baseUrl }) => {
      const controller = new AbortController()
      const p = streamAsk({ question: 'Tell me about Testa b' }, { baseUrl, signal: controller.signal, onProgress: (e) => e.stage === 'model' && controller.abort() })
      expect(await errorOf(p)).toMatchObject({ code: 'CANCELLED' })
      await new Promise((r) => setTimeout(r, 50))
      expect(aborted).toBe(true)
    })
  })

  it('reports network failures and a client-side timeout', async () => {
    expect(await errorOf(streamAsk({ question: 'q' }, { baseUrl: 'http://localhost:1' }))).toMatchObject({ code: 'NETWORK' })
    await withServer([(req) => sleep(5000, req.signal)], {}, async ({ baseUrl }) => {
      expect(await errorOf(streamAsk({ question: 'Tell me about Testa b' }, { baseUrl, timeoutMs: 100 }))).toMatchObject({ code: 'TIMEOUT' })
    })
  })
})
