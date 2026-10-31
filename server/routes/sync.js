// NASA sync API — owner: DATA (implemented by LEAD in M5 Phase A).
//
//   GET  /api/sync/status   public: last success vs last attempt, count, changes, next sync, recent error
//   POST /api/sync/check    anonymous "check for updates": global cooldown + per-client limit
//   POST /api/sync/refresh  admin: Authorization: Bearer <SYNC_ADMIN_TOKEN> (server-side only)
//
// No endpoint returns catalogue data or secrets. The admin token lives only
// in the server environment; it is compared in constant time, never logged,
// and repeated wrong tokens lock the client out for a while.

import { createHash, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { apiError } from '../http/sendJson.js'

export const MIN_TOKEN_LENGTH = 24
const WINDOW_MS = 10 * 60_000
const CHECKS_PER_WINDOW = 5 //         anonymous check requests per client per 10 min
const BAD_TOKENS_PER_WINDOW = 5 //     wrong admin tokens per client per 10 min

/** Sliding-window counter per key (bounded memory). */
function createCounter(limit, windowMs, now) {
  const hits = new Map()
  return {
    /** @returns {number} seconds to wait, or 0 when allowed (and counted) */
    hit(key) {
      const t = now()
      const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
      if (list.length >= limit) {
        hits.set(key, list)
        return Math.max(1, Math.ceil((windowMs - (t - list[0])) / 1000))
      }
      list.push(t)
      hits.set(key, list)
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k)
      return 0
    },
    blocked(key) {
      const t = now()
      return (hits.get(key) ?? []).filter((x) => t - x < windowMs).length >= limit
    },
  }
}

const digest = (s) => createHash('sha256').update(String(s)).digest()
const tokenMatches = (given, expected) => timingSafeEqual(digest(given), digest(expected))

/**
 * @param {{ sync: ReturnType<typeof import('../nasa/syncService.js').createSyncService> | null, adminToken?: string|null, now?: () => number }} deps
 */
export function syncRouter({ sync, adminToken = null, now = Date.now }) {
  const r = Router()
  const checks = createCounter(CHECKS_PER_WINDOW, WINDOW_MS, now)
  const badTokens = createCounter(BAD_TOKENS_PER_WINDOW, WINDOW_MS, now)
  const token = typeof adminToken === 'string' && adminToken.length >= MIN_TOKEN_LENGTH ? adminToken : null

  r.get('/sync/status', (_req, res) => {
    if (!sync) return apiError(res, 503, 'UNAVAILABLE', 'Catalogue sync is not running on this server.')
    res.set('Cache-Control', 'no-store').json(sync.status())
  })

  r.post('/sync/check', (req, res) => {
    if (!sync) return apiError(res, 503, 'UNAVAILABLE', 'Catalogue sync is not running on this server.')
    const wait = checks.hit(req.ip ?? 'unknown')
    if (wait) {
      res.set('Retry-After', String(wait))
      return apiError(res, 429, 'RATE_LIMITED', 'Too many update checks from this device. Please wait.')
    }
    const out = sync.requestCheck()
    if (!out.accepted) {
      res.set('Retry-After', String(out.retryAfterS))
      return res.status(429).json({ error: { code: 'SYNC_COOLDOWN', message: 'NASA was checked recently. The catalogue is up to date with that check.' }, retryAfterS: out.retryAfterS, status: sync.status() })
    }
    res.status(202).set('Cache-Control', 'no-store').json({ accepted: true, reason: out.reason, status: sync.status() })
  })

  r.post('/sync/refresh', async (req, res) => {
    if (!sync || !token) return apiError(res, 404, 'NOT_FOUND', 'Unknown API route.')
    const client = req.ip ?? 'unknown'
    if (badTokens.blocked(client)) return apiError(res, 429, 'RATE_LIMITED', 'Too many failed attempts. Try again later.')
    const header = req.get('authorization') ?? ''
    const given = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!given || !tokenMatches(given, token)) {
      badTokens.hit(client)
      return apiError(res, 401, 'UNAUTHORIZED', 'A valid admin token is required.')
    }
    const out = sync.requestAdminRefresh()
    if (!out.accepted) {
      res.set('Retry-After', String(out.retryAfterS))
      return res.status(429).json({ error: { code: 'SYNC_COOLDOWN', message: 'A sync just ran. Try again shortly.' }, retryAfterS: out.retryAfterS })
    }
    // ?wait=1 (used by the CLI) responds when the sync has finished.
    if (req.query.wait === '1' || req.query.wait === 'true') {
      const result = await out.promise
      return res.set('Cache-Control', 'no-store').json({ accepted: true, reason: out.reason, result: result?.result ?? null, status: sync.status() })
    }
    res.status(202).set('Cache-Control', 'no-store').json({ accepted: true, reason: out.reason, status: sync.status() })
  })

  return r
}
