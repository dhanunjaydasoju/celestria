// AI Astronomer configuration — owner: AI (implemented by LEAD in M5).
// SERVER ONLY. Never import this from src/ (the browser bundle).
//
// The API key is held in a closure: it is not an enumerable property, so it
// never appears in JSON.stringify, util.inspect, logs or error messages.
// Use config.authHeaders() to make requests and redact() on any text that
// might echo it back.

const DEFAULTS = {
  FEATHERLESS_BASE_URL: 'https://api.featherless.ai/v1',
  FEATHERLESS_MODEL: 'Qwen/Qwen3-32B',
  FEATHERLESS_FALLBACK_MODEL: 'Qwen/Qwen3-14B',
}

/** Integer limits: [default, min, max]. All overridable via .env. */
const LIMITS = {
  AI_RATE_LIMIT_PER_MINUTE: [10, 1, 120], //   per client IP
  AI_RATE_LIMIT_PER_DAY: [100, 1, 5000], //    per client IP
  AI_DAILY_REQUEST_BUDGET: [500, 1, 100000], // questions sent to the model per UTC day, whole server (cache hits are free)
  AI_MAX_CONCURRENCY: [1, 1, 8], //            questions in flight at once; each makes its model calls one at a time
  AI_MAX_QUEUE: [4, 0, 50], //                 questions waiting for a free slot (beyond this: 503 busy)
  AI_QUEUE_TIMEOUT_MS: [15000, 0, 120000], //  longest wait for a slot
  AI_MAX_TOOL_ROUNDS: [6, 1, 12], //           model ↔ tool round trips per question
  AI_MAX_TOOL_CALLS_PER_ROUND: [8, 1, 16],
  AI_MAX_OUTPUT_TOKENS: [1200, 128, 4096],
  AI_PROMPT_TOKEN_BUDGET: [24000, 2000, 120000], // keep below the model context (Qwen3: 32,768)
  AI_MAX_INPUT_CHARS: [2000, 100, 8000], //     per user message
  AI_MAX_HISTORY_TURNS: [8, 1, 30],
  AI_REQUEST_TIMEOUT_MS: [90000, 5000, 180000], // whole question, all rounds
  AI_CALL_TIMEOUT_MS: [45000, 2000, 120000], //  one Featherless call (output runs at ~30–50 tokens/s)
  AI_MAX_REPAIR_ATTEMPTS: [2, 0, 4], //        re-asks after an answer fails validation
  AI_CACHE_TTL_SECONDS: [600, 0, 86400],
}

/** Decimal limits (US dollars): [default, min, max]. */
const DECIMAL_LIMITS = {
  AI_DAILY_SPEND_LIMIT_USD: [1, 0.01, 500], //       whole server, per UTC day
  AI_COST_RESERVE_PER_CALL_USD: [0.002, 0.00001, 1], // held per call until the provider reports the real cost
}

function parseLimit(env, name, [def, min, max], integer = true) {
  const raw = env[name]
  if (raw == null || raw === '') return def
  const n = Number(raw)
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`)
  }
  return n
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function loadAiConfig(env = process.env) {
  const key = (env.FEATHERLESS_API_KEY ?? '').trim()
  const limits = Object.freeze({
    ...Object.fromEntries(Object.entries(LIMITS).map(([k, spec]) => [k, parseLimit(env, k, spec)])),
    ...Object.fromEntries(Object.entries(DECIMAL_LIMITS).map(([k, spec]) => [k, parseLimit(env, k, spec, false)])),
  })

  const config = {
    baseUrl: (env.FEATHERLESS_BASE_URL || DEFAULTS.FEATHERLESS_BASE_URL).replace(/\/+$/, ''),
    model: env.FEATHERLESS_MODEL || DEFAULTS.FEATHERLESS_MODEL,
    fallbackModel: env.FEATHERLESS_FALLBACK_MODEL || DEFAULTS.FEATHERLESS_FALLBACK_MODEL,
    limits,
    /** True when a key is present (the key itself is never exposed). */
    get configured() {
      return key.length > 0
    },
    /** Headers for Featherless requests. */
    authHeaders() {
      if (!key) throw new Error('FEATHERLESS_API_KEY is not set')
      return {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://celestria.local',
        'X-Title': 'CELESTRIA',
      }
    },
    /** Remove the key from any text (error bodies, logs) before it leaves the server. */
    redact(text) {
      if (!key || text == null) return text
      return String(text).split(key).join('[REDACTED]')
    },
    /** Safe summary for logs and health checks. */
    toJSON() {
      return { baseUrl: config.baseUrl, model: config.model, fallbackModel: config.fallbackModel, configured: key.length > 0, limits }
    },
  }
  return Object.freeze(config)
}

export const AI_LIMIT_SPECS = { ...LIMITS, ...DECIMAL_LIMITS }
