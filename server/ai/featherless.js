// Featherless chat client (OpenAI-compatible) — owner: AI (LEAD in M5 Phase 2).
// SERVER ONLY.
//
// One request per call, no internal retries: the orchestrator decides about
// fallback. Every failure becomes a ProviderError with `retryable` set, so a
// timeout, a 5xx, a 429, a malformed body or Featherless' "HTTP 200 with an
// error object" (seen in Phase 0) is handled the same way. Error text is
// passed through config.redact() and never contains the key.

export class ProviderError extends Error {
  /**
   * @param {string} code      timeout | aborted | network | rate_limited | upstream | auth | bad_request | model_unavailable | provider_error | malformed
   * @param {string} message
   * @param {{ retryable: boolean, status?: number }} opts
   */
  constructor(code, message, { retryable, status, providerCode } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryable = Boolean(retryable)
    this.status = status ?? null
    // The provider's own error code (e.g. "capacity_exhausted"), for logs.
    this.providerCode = typeof providerCode === 'string' && /^[\w.-]{1,40}$/.test(providerCode) ? providerCode : null
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

/**
 * @param {ReturnType<typeof import('./config.js').loadAiConfig>} config
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export function createFeatherlessClient(config, { fetch: doFetch = globalThis.fetch } = {}) {
  const clip = (text) => config.redact(String(text ?? '')).replace(/\s+/g, ' ').slice(0, 200)

  /**
   * @param {{ model: string, messages: object[], tools?: object[], maxTokens: number, timeoutMs: number, signal?: AbortSignal }} req
   * @returns {Promise<{ model: string, message: { content: string, tool_calls?: object[] }, finishReason: string|null, usage: { promptTokens: number|null, completionTokens: number|null, costUsd: number|null } }>}
   */
  async function chat({ model, messages, tools, maxTokens, timeoutMs, signal }) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let res
    let text
    try {
      res = await doFetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: config.authHeaders(),
        body: JSON.stringify({ model, messages, ...(tools?.length ? { tools } : {}), temperature: 0.2, max_tokens: maxTokens }),
        signal: combined,
      })
      text = await res.text()
    } catch (err) {
      if (signal?.aborted) throw new ProviderError('aborted', 'Request cancelled', { retryable: false })
      if (timeout.aborted || err?.name === 'TimeoutError') throw new ProviderError('timeout', `No response within ${timeoutMs} ms`, { retryable: true })
      throw new ProviderError('network', `Network error: ${clip(err?.message)}`, { retryable: true })
    }

    if (!res.ok) {
      const status = res.status
      if (status === 401 || status === 403) throw new ProviderError('auth', 'Featherless rejected the API key', { retryable: false, status })
      if (status === 404) throw new ProviderError('model_unavailable', `Model ${model} unavailable: ${clip(text)}`, { retryable: true, status })
      if (status === 429) throw new ProviderError('rate_limited', 'Featherless rate limit or concurrency limit reached', { retryable: true, status })
      if (RETRYABLE_STATUS.has(status) || status >= 500) throw new ProviderError('upstream', `Featherless HTTP ${status}: ${clip(text)}`, { retryable: true, status })
      throw new ProviderError('bad_request', `Featherless HTTP ${status}: ${clip(text)}`, { retryable: false, status })
    }

    let json
    try {
      json = JSON.parse(text)
    } catch {
      throw new ProviderError('malformed', 'Response was not JSON', { retryable: true, status: res.status })
    }
    // Featherless can answer HTTP 200 with { error: {...} } and no choices.
    if (json?.error) {
      throw new ProviderError('provider_error', `Provider error: ${clip(json.error.message ?? json.error.code ?? JSON.stringify(json.error))}`, { retryable: true, status: res.status, providerCode: json.error.code })
    }
    const choice = json?.choices?.[0]
    const message = choice?.message
    if (!message || typeof message !== 'object') throw new ProviderError('malformed', 'Response had no message', { retryable: true, status: res.status })
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.filter((t) => t?.function?.name) : []
    if (typeof message.content !== 'string' && !toolCalls.length) throw new ProviderError('malformed', 'Response had neither text nor tool calls', { retryable: true, status: res.status })

    const usage = json.usage ?? {}
    return {
      model: json.model ?? model,
      // Reasoning text (message.reasoning) is dropped: never shown, never validated.
      message: { content: typeof message.content === 'string' ? message.content : '', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      finishReason: choice.finish_reason ?? null,
      usage: {
        promptTokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
        completionTokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
        costUsd: Number.isFinite(usage.cost) ? usage.cost : null,
      },
    }
  }

  return { chat }
}
