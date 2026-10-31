// Client for the CELESTRIA API — owner: DATA (D3.5; implemented by LEAD in M4).
// Signatures follow src/contracts/api.js. Every failure throws ApiError.
// Unit tests (MODE 'test') and VITE_USE_FIXTURES=true use local fixtures.

import { API_ERROR, ApiError } from '../contracts/api.js'
import { fixturePlanets } from '../data/fixtures/index.js'
import { getAskStatus, streamAsk } from './astronomerClient.js'

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
 * Habitability dashboard data (computed server-side from full NASA records).
 * Fixture mode computes it locally from the fixtures.
 */
export async function getHabitability() {
  if (USE_FIXTURES) throw new ApiError(API_ERROR.NOT_IMPLEMENTED, 'The habitability dashboard needs the server.', 503)
  return once('habitability', () => fetchJson('/api/habitability'))
}

/** Forget cached planet details (after the server switched to newer NASA data). */
export function clearPlanetCache() {
  detailCache.clear()
}

/**
 * NASA synchronisation status (last success vs last attempt, changes, next sync).
 * Fixture mode has no server: returns null.
 * @returns {Promise<import('../contracts/api.js').SyncStatus|null>}
 */
export async function getSyncStatus() {
  if (USE_FIXTURES) return null
  const res = await fetch('/api/sync/status', { headers: { Accept: 'application/json' } }).catch(() => null)
  if (!res?.ok) return null
  return res.json()
}

/**
 * Anonymous "check NASA for updates". The server applies a global cooldown and
 * a per-device limit; no credentials are involved.
 * @returns {Promise<{ accepted: boolean, reason: string, retryAfterS?: number, status?: object, message?: string }>}
 */
export async function requestSyncCheck() {
  if (USE_FIXTURES) return { accepted: false, reason: 'unavailable', message: 'Not available in fixture mode.' }
  const res = await fetch('/api/sync/check', { method: 'POST', headers: { Accept: 'application/json' } }).catch(() => null)
  if (!res) return { accepted: false, reason: 'network', message: 'Could not reach the CELESTRIA server.' }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return body
  return { accepted: false, reason: body.error?.code === 'SYNC_COOLDOWN' ? 'cooldown' : 'rate_limited', retryAfterS: body.retryAfterS ?? (Number(res.headers.get('retry-after')) || null), message: body.error?.message, status: body.status }
}

/**
 * Ask the AI astronomer (POST /api/ask, streamed progress). Fixture mode has
 * no AI: it reports the astronomer as unavailable instead of inventing answers.
 * @param {import('../contracts/api.js').AskRequest} req
 * @param {{ onProgress?: (event: object) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<import('../contracts/api.js').AskResponse>}
 */
export async function askAstronomer(req, opts) {
  if (USE_FIXTURES) throw new ApiError('AI_UNAVAILABLE', 'The AI astronomer is not available in fixture mode.', 503)
  return streamAsk(req, opts)
}

/** @returns {Promise<{ available: boolean, model: string|null }>} */
export async function getAstronomerStatus() {
  if (USE_FIXTURES) return { available: false, model: null }
  return getAskStatus()
}
