// Streaming client for POST /api/ask — owner: AI (implemented by LEAD in M5
// Phase 3). Shapes: src/contracts/api.js (AskRequest, AskResponse).
//
// Reads the NDJSON stream: progress events are passed to `onProgress` as the
// server reports them; the promise resolves with the validated result or
// rejects with ApiError. The browser never sees model text, only what the
// server validated. No API key is involved on this side.

import { ApiError } from '../contracts/api.js'

/** Client-side safety net; the server's own deadline (AI_REQUEST_TIMEOUT_MS) is shorter. */
export const CLIENT_TIMEOUT_MS = 150_000

/** Split a byte stream into parsed JSON lines. */
export async function* readNdjson(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
    if (done) break
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}

const apiErrorFrom = ({ code, message, status, retryAfterS }) => Object.assign(new ApiError(code ?? 'UNKNOWN', message ?? 'Something went wrong.', status ?? 0), { retryAfterS: retryAfterS ?? null })

/**
 * @param {import('../contracts/api.js').AskRequest} req
 * @param {{ onProgress?: (event: object) => void, signal?: AbortSignal, baseUrl?: string, fetch?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<import('../contracts/api.js').AskResponse>}
 */
export async function streamAsk(req, { onProgress, signal, baseUrl = '', fetch: doFetch = globalThis.fetch, timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res
  try {
    res = await doFetch(`${baseUrl}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(req),
      signal: combined,
    })
  } catch {
    throw abortReason(signal, timeout) ?? new ApiError('NETWORK', 'Could not reach the CELESTRIA server.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw apiErrorFrom({ ...body?.error, status: res.status, retryAfterS: Number(res.headers.get('retry-after')) || null })
  }
  try {
    for await (const msg of readNdjson(res.body)) {
      if (msg.type === 'progress') onProgress?.(msg)
      else if (msg.type === 'result') return msg.result
      else if (msg.type === 'error') throw apiErrorFrom(msg.error)
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw abortReason(signal, timeout) ?? new ApiError('NETWORK', 'The connection to the server was interrupted.')
  }
  throw new ApiError('NETWORK', 'The server ended the response without an answer.')
}

function abortReason(signal, timeout) {
  if (signal?.aborted) return new ApiError('CANCELLED', 'Question cancelled.')
  if (timeout.aborted) return new ApiError('TIMEOUT', 'No answer arrived in time.')
  return null
}

/** @returns {Promise<{ available: boolean, model: string|null }>} */
export async function getAskStatus({ baseUrl = '', fetch: doFetch = globalThis.fetch } = {}) {
  try {
    const res = await doFetch(`${baseUrl}/api/ask/status`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { available: false, model: null }
    return await res.json()
  } catch {
    return { available: false, model: null }
  }
}
