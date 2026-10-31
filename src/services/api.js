// Client for the CELESTRIA API — owner: DATA (D3.5; implemented by LEAD in M4).
// Signatures follow src/contracts/api.js. Every failure throws ApiError.
// Unit tests (MODE 'test') and VITE_USE_FIXTURES=true use local fixtures.

import { API_ERROR, ApiError } from '../contracts/api.js'
import { fixturePlanets } from '../data/fixtures/index.js'

const USE_FIXTURES = import.meta.env.MODE === 'test' || import.meta.env.VITE_USE_FIXTURES === 'true'
const TIMEOUT_MS = 20000

const inflight = new Map()
const detailCache = new Map()

async function fetchJson(path, { retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } })
      const body = await res.json().catch(() => null)
      if (res.ok) return body
      const code = res.status === 404 ? API_ERROR.NOT_FOUND : res.status === 429 ? API_ERROR.RATE_LIMITED : res.status >= 500 ? API_ERROR.UPSTREAM : API_ERROR.BAD_REQUEST
      const err = new ApiError(code, body?.error?.message ?? `Request failed (${res.status})`, res.status)
      if (res.status < 500 || attempt >= retries) throw err
    } catch (err) {
      if (err instanceof ApiError && (err.status < 500 || attempt >= retries)) throw err
      if (attempt >= retries) {
        throw err.name === 'AbortError'
          ? new ApiError(API_ERROR.TIMEOUT, 'The server took too long to respond.')
          : new ApiError(API_ERROR.NETWORK, 'Could not reach the CELESTRIA server.')
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** One request per key at a time. */
function once(key, run) {
  if (!inflight.has(key)) inflight.set(key, run().finally(() => inflight.delete(key)))
  return inflight.get(key)
}

/**
 * Catalogue index: every planet, without per-value sources/uncertainties.
 * @returns {Promise<import('../contracts/api.js').CatalogResponse>}
 */
export async function getCatalog() {
  if (USE_FIXTURES) {
    return { generatedAt: new Date(0).toISOString(), source: 'fixtures', count: fixturePlanets.length, planets: fixturePlanets }
  }
  return once('catalog', () => fetchJson('/api/catalog'))
}

/**
 * Full planet record (uncertainties + sources) and its system.
 * @param {string} id
 * @returns {Promise<import('../contracts/api.js').PlanetResponse>}
 */
export async function getPlanet(id) {
  if (USE_FIXTURES) {
    const planet = fixturePlanets.find((p) => p.id === id)
    if (!planet) throw new ApiError(API_ERROR.NOT_FOUND, `No planet with id "${id}".`, 404)
    return { planet, system: fixturePlanets.filter((p) => p.host === planet.host) }
  }
  if (detailCache.has(id)) return detailCache.get(id)
  const res = await once(`planet:${id}`, () => fetchJson(`/api/planets/${encodeURIComponent(id)}`))
  detailCache.set(id, res)
  return res
}

/**
 * Owner of the endpoint: AI (D4.3). Not built yet.
 * @param {import('../contracts/api.js').AstronomerRequest} _req
 * @returns {Promise<import('../contracts/api.js').AstronomerResponse>}
 */
export async function askAstronomer(_req) {
  throw new ApiError(API_ERROR.NOT_IMPLEMENTED, 'AI astronomer not available yet (D4.3).')
}
