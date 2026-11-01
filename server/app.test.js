import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'

let server
let base

beforeEach(() => {
  const app = createApp({ store: { get: () => null } })
  server = app.listen(0)
  base = `http://localhost:${server.address().port}`
})

afterEach(() => {
  server.close()
  vi.restoreAllMocks()
})

const postAsk = (body, headers = {}) => fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })

describe('request-body errors', () => {
  it('answers malformed JSON with 400 in the API error shape, without logging', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await postAsk('{"question": "Tell me about')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'The request body is not valid JSON.' } })
    expect(log).not.toHaveBeenCalled()
  })

  it('answers bodies over the 32 kB limit with 413', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await postAsk(JSON.stringify({ question: 'x'.repeat(40 * 1024) }))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is larger than 32kb.' } })
  })

  it('still accepts a well-formed body under the limit', async () => {
    // The AI is not configured in this app, so a parsed body reaches the route's own check.
    const res = await postAsk(JSON.stringify({ question: 'Tell me about Kepler-22 b' }))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('AI_UNAVAILABLE')
  })
})

describe('other errors', () => {
  it('keeps the generic 500 for unrelated server errors', async () => {
    server.close()
    const app = createApp({ store: { get: () => { throw new Error('boom') } } })
    server = app.listen(0)
    base = `http://localhost:${server.address().port}`
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await fetch(`${base}/api/health`)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { code: 'UNKNOWN', message: 'Internal server error.' } })
    expect(log).toHaveBeenCalled()
  })
})
