// CONTRACT — owner: LEAD. HTTP API between the Express server (DATA, AI)
// and the browser. Mirrors CLAUDE.md §11.2.
//
//   GET  /api/health          → HealthResponse
//   GET  /api/catalog         → CatalogResponse (index: no per-value `source` or `err`)
//   GET  /api/planets         → alias of /api/catalog (M0 contract)
//   GET  /api/planets/:id     → PlanetResponse (full record: uncertainties + sources)
//   GET  /api/systems/:host   → { host, planets: Planet[] } (full records)
//   POST /api/astronomer      AstronomerRequest → AstronomerResponse (not built yet)
//
// Large responses are gzipped when the client accepts it and carry ETags.
// Index planets omit `err` and `source`; fetch /api/planets/:id where
// uncertainties or citations are displayed.
//
// Every error response: { error: { code, message } } with a proper HTTP status.

/** @typedef {import('./planet.js').Planet} Planet */

/**
 * 'live' = refreshed from NASA during this server run; 'snapshot' = loaded
 * from the committed snapshot file; 'fixtures' = local dev fixtures.
 * @typedef {'live'|'snapshot'|'fixtures'} CatalogSource
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
