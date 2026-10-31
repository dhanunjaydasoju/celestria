// CONTRACT — owner: LEAD. HTTP API between the Express server (DATA, AI)
// and the browser. Mirrors CLAUDE.md §11.2.
//
//   GET  /api/health          → HealthResponse
//   GET  /api/catalog         → CatalogResponse (index: no per-value `source` or `err`)
//   GET  /api/planets         → alias of /api/catalog (M0 contract)
//   GET  /api/planets/:id     → PlanetResponse (full record: uncertainties + sources)
//   GET  /api/systems/:host   → { host, planets: Planet[] } (full records)
//   GET  /api/sync/status     → SyncStatus
//   POST /api/sync/check      → 202 { accepted, reason, status } | 429 SYNC_COOLDOWN / RATE_LIMITED
//   (an admin-only forced sync exists server-side; see server/routes/sync.js — never called from the browser)
//   POST /api/ask             AskRequest → AskResponse (M5; replaces /api/astronomer)
//                             With `Accept: application/x-ndjson`: AskProgress lines, then
//                             { type: 'result', result } or { type: 'error', error }
//   GET  /api/ask/status      → { available: boolean, model: string|null }
//   POST /api/astronomer      AstronomerRequest → AstronomerResponse (superseded by /api/ask, not built)
//
// Large responses are gzipped when the client accepts it and carry ETags.
// Index planets omit `err` and `source`; fetch /api/planets/:id where
// uncertainties or citations are displayed.
//
// Every error response: { error: { code, message } } with a proper HTTP status.

/** @typedef {import('./planet.js').Planet} Planet */

/**
 * 'live' = synced from NASA during this server run; 'runtime' = the latest
 * validated sync on disk; 'backup' = the last-known-good copy; 'seed' = the
 * committed snapshot; 'fixtures' = local dev fixtures.
 * @typedef {'live'|'runtime'|'backup'|'seed'|'fixtures'} CatalogSource
 */

/**
 * GET /api/sync/status. lastSuccessAt (a sync completed with a valid NASA
 * catalogue) and lastAttemptAt (any sync finished, including failures) are
 * deliberately separate.
 * @typedef {Object} SyncStatus
 * @property {string} source
 * @property {{ count: number, retrievedAt: string, origin: CatalogSource }|null} catalog
 * @property {{ enabled: boolean, running: boolean, runningSince: string|null, lastSuccessAt: string|null,
 *   lastAttemptAt: string|null, lastAttemptResult: 'updated'|'unchanged'|'failed'|'rejected'|null,
 *   lastChangeAt: string|null, lastChanges: { added: number, removed: number, updated: number, examples: object }|null,
 *   lastError: { at: string, stage: string, message: string }|null, consecutiveFailures: number,
 *   nextScheduledAt: string|null, intervalHours: number, checkAvailableInS: number|null }} sync
 */

/**
 * @typedef {Object} HealthResponse
 * @property {boolean} ok
 * @property {{ count: number, generatedAt: string|null, source: CatalogSource|null }} catalog
 */

/**
 * @typedef {Object} CatalogResponse
 * @property {string} generatedAt   ISO timestamp of the NASA fetch
 * @property {CatalogSource} source
 * @property {number} count
 * @property {Planet[]} planets
 */

/**
 * @typedef {Object} PlanetResponse
 * @property {Planet} planet
 * @property {Planet[]} system   all catalog planets with the same host, including `planet`
 */

/**
 * The client sends ids only. The server looks the planets up in its own cache
 * so the AI is grounded in real data (CLAUDE.md F6B).
 * @typedef {Object} AstronomerRequest
 * @property {'survivability'|'compare'|'ask'} mode
 * @property {string[]} planetIds
 * @property {string} [question]   required when mode === 'ask'
 */

/**
 * @typedef {'observed'|'estimated'|'unknown'|'speculation'} AiBasis
 */

/**
 * Survivability section keys: survival, risks, lifeConditions, interesting,
 * unknowns, earthComparison.
 * @typedef {Object} AstronomerResponse
 * @property {string} mode
 * @property {string[]} planetIds
 * @property {string} model
 * @property {boolean} cached
 * @property {{ key: string, title: string, items: { text: string, basis: AiBasis }[] }[]} sections
 */

/**
 * Free-form question to the AI astronomer (M5). Text and ids only: every
 * number in the answer comes from the server's catalogue via validated tools.
 * @typedef {Object} AskRequest
 * @property {string} question             ≤ AI_MAX_INPUT_CHARS
 * @property {string} [planetId]           page context (e.g. the open profile)
 * @property {string} [host]               page context: the system on the System View
 * @property {string[]} [compareIds]       page context: planets being compared (≤ 4)
 * @property {{ role: 'user'|'assistant', content: string }[]} [history]  earlier turns (not cached)
 */

/**
 * Claim bases (validated server-side against tool data):
 * measured | calculated | estimated | minimum | assumed | catalog |
 * classification | unavailable | established | hypothesis
 * @typedef {'measured'|'calculated'|'estimated'|'minimum'|'assumed'|'catalog'|'classification'|'unavailable'|'established'|'hypothesis'} ClaimBasis
 */

/**
 * @typedef {Object} AskResponse
 * @property {'answered'|'clarification'|'not_found'|'insufficient_data'|'unverified'} status
 *   answered: validated sections · clarification: `options` to choose from ·
 *   not_found / insufficient_data / unverified: fixed `message`, never model text
 * @property {string} [message]
 * @property {{ title: string, claims: { text: string, basis: ClaimBasis, refs: string[] }[] }[]} sections
 * @property {{ id: string, name: string, profileUrl: string, nasaOverviewUrl: string }[]} [options]
 * @property {{ id: string, name: string, profileUrl: string, nasaOverviewUrl: string }[]} links
 * @property {{ label: string, url: string|null }[]} sources   NASA / ADS references used
 * @property {string} model
 * @property {boolean} fallbackUsed
 * @property {boolean} cached
 * @property {{ name: string, args: object, status: string }[]} tools
 * @property {{ calls: number, costUsd: number }} usage
 * @property {{ repairs: number, warnings: object[], issues?: string[] }} validation
 * @property {number} ms
 *
 * Errors: 400 BAD_REQUEST · 429 RATE_LIMITED | DAILY_LIMIT (Retry-After) ·
 * 503 AI_UNAVAILABLE | BUSY | BUDGET_EXHAUSTED | SPEND_EXHAUSTED ·
 * 502 PROVIDER_ERROR · 504 TIMEOUT
 */

/**
 * One streamed stage, sent only when the server actually reaches it.
 * stage: queued {position} · admitted · cached · retrieved {tools} ·
 * model {call, model, purpose: draft|repair|final} · tools {tools} ·
 * fallback {from, to, reason} · validating · repair {attempt, of, issues}
 * @typedef {{ type: 'progress', stage: string, at: number } & Record<string, unknown>} AskProgress
 */

export const API_ERROR = Object.freeze({
  NETWORK: 'NETWORK',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  UPSTREAM: 'UPSTREAM',          // NASA or Featherless failed
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  UNKNOWN: 'UNKNOWN',
})

/** Thrown by src/services/api.js for every failed request. */
export class ApiError extends Error {
  /**
   * @param {string} code     one of API_ERROR
   * @param {string} message  safe to show to users
   * @param {number} [status] HTTP status, 0 for network errors
   */
  constructor(code, message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}
