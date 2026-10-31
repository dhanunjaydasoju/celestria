import { describe, expect, it } from 'vitest'
import { loadAiConfig } from './config.js'
import { createFeatherlessClient, ProviderError } from './featherless.js'

const KEY = 'fake-key-for-tests-0123456789'
const config = loadAiConfig({ FEATHERLESS_API_KEY: KEY })
const REQ = { model: 'Qwen/Qwen3-32B', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, timeoutMs: 1000 }

const respond = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
const client = (fetchImpl) => createFeatherlessClient(config, { fetch: fetchImpl })

async function failure(fetchImpl, req = REQ) {
  try {
    await client(fetchImpl).chat(req)
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.message).not.toContain(KEY)
    return err
  }
  throw new Error('expected a ProviderError')
}

describe('Featherless client', () => {
  it('sends the key only in the Authorization header and parses text, tool calls and cost', async () => {
    let sent
    const c = client(async (url, init) => {
      sent = { url, init }
      return new Response(JSON.stringify({
        model: 'Qwen/Qwen3-32B',
        choices: [{ finish_reason: 'tool_calls', message: { content: null, reasoning: 'secret thoughts', tool_calls: [{ id: 'a', type: 'function', function: { name: 'get_planet', arguments: '{"name":"x"}' } }] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.00021 },
      }))
    })
    const r = await c.chat({ ...REQ, tools: [{ type: 'function', function: { name: 'get_planet' } }] })
    expect(sent.url).toBe('https://api.featherless.ai/v1/chat/completions')
    expect(sent.init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(sent.init.body).not.toContain(KEY)
    expect(JSON.parse(sent.init.body)).toMatchObject({ model: 'Qwen/Qwen3-32B', max_tokens: 100, tools: [{ type: 'function' }] })
    expect(r).toMatchObject({ finishReason: 'tool_calls', usage: { costUsd: 0.00021 }, message: { content: '', tool_calls: [{ function: { name: 'get_planet' } }] } })
    expect(JSON.stringify(r)).not.toContain('secret thoughts') // reasoning is dropped
  })

  it('omits tools when none are offered', async () => {
    let body
    await client(async (_u, init) => {
      body = JSON.parse(init.body)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
    }).chat(REQ)
    expect(body).not.toHaveProperty('tools')
  })

  it('times out as a retryable error', async () => {
    const hang = (_u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
    const err = await failure(hang, { ...REQ, timeoutMs: 30 })
    expect(err).toMatchObject({ code: 'timeout', retryable: true })
  })

  it('reports a caller cancellation as non-retryable', async () => {
    const controller = new AbortController()
    const hang = (_u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
    setTimeout(() => controller.abort(), 10)
    const err = await failure(hang, { ...REQ, signal: controller.signal })
    expect(err).toMatchObject({ code: 'aborted', retryable: false })
  })

  it('treats network errors as retryable', async () => {
    const err = await failure(async () => {
      throw new TypeError('fetch failed')
    })
    expect(err).toMatchObject({ code: 'network', retryable: true })
  })

  it('treats HTTP 200 with an error body (no choices) as a retryable provider error', async () => {
    const err = await failure(respond(200, { error: { code: 'no_response', message: 'The model did not respond' } }))
    expect(err).toMatchObject({ code: 'provider_error', retryable: true })
  })

  it('treats malformed 200 responses as retryable', async () => {
    expect(await failure(respond(200, '<html>oops</html>'))).toMatchObject({ code: 'malformed', retryable: true })
    expect(await failure(respond(200, { choices: [] }))).toMatchObject({ code: 'malformed', retryable: true })
    expect(await failure(respond(200, { choices: [{ message: { content: null } }] }))).toMatchObject({ code: 'malformed', retryable: true })
  })

  it('classifies HTTP errors', async () => {
    expect(await failure(respond(429, 'slow down'))).toMatchObject({ code: 'rate_limited', retryable: true, status: 429 })
    expect(await failure(respond(503, 'busy'))).toMatchObject({ code: 'upstream', retryable: true })
    expect(await failure(respond(404, 'Gone'))).toMatchObject({ code: 'model_unavailable', retryable: true })
    expect(await failure(respond(401, 'bad key'))).toMatchObject({ code: 'auth', retryable: false })
    expect(await failure(respond(400, 'bad'))).toMatchObject({ code: 'bad_request', retryable: false })
  })

  it('redacts the key if an upstream error echoes it', async () => {
    const err = await failure(respond(502, `invalid token ${KEY}`))
    expect(err.message).toContain('[REDACTED]')
  })
})
