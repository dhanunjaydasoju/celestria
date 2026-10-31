// HTTP with timeouts and retries — owner: DATA (implemented by LEAD in M4).

/** Errors worth retrying: network failures, timeouts, 429 and 5xx. */
export class HttpError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.retryable = retryable
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * fetch() with a per-attempt timeout and exponential backoff with jitter.
 * delay = baseDelayMs · 2^attempt · (0.5 … 1.0)
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, retries?: number, baseDelayMs?: number,
 *           fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void>,
 *           onRetry?: (info: { attempt: number, delayMs: number, error: Error }) => void }} [opts]
 */
export async function fetchWithRetry(url, opts = {}) {
  const {
    timeoutMs = 30000,
    retries = 4,
    baseDelayMs = 1000,
    fetchImpl = fetch,
    sleepImpl = sleep,
    onRetry,
  } = opts
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { signal: controller.signal })
      if (res.ok) return res
      const retryable = res.status === 429 || res.status >= 500
      throw new HttpError(`HTTP ${res.status}`, { status: res.status, retryable })
    } catch (err) {
      const error =
        err instanceof HttpError
          ? err
          : new HttpError(err?.name === 'AbortError' ? `Timed out after ${timeoutMs} ms` : String(err?.message ?? err), {
              retryable: true,
            })
      lastError = error
      if (!error.retryable || attempt === retries) break
      const delayMs = Math.round(baseDelayMs * 2 ** attempt * (0.5 + Math.random() / 2))
      onRetry?.({ attempt: attempt + 1, delayMs, error })
      await sleepImpl(delayMs)
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}
