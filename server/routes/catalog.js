// Catalogue API — owner: DATA (LEAD in M4). Shapes: src/contracts/api.js.

import { Router } from 'express'
import { apiError, sendJson } from '../http/sendJson.js'

const SOURCE = 'NASA Exoplanet Archive, pscomppars'

/** @param {ReturnType<typeof import('../nasa/catalogStore.js').createCatalogStore>} store */
export function catalogRouter(store) {
  const r = Router()
  const ready = (res) => {
    const s = store.get()
    if (!s) apiError(res, 503, 'UNAVAILABLE', 'Catalogue is loading.')
    return s
  }

  r.get('/health', (_req, res) => {
    const s = store.get()
    res.json({ ok: true, catalog: { count: s?.planets.length ?? 0, generatedAt: s?.meta.retrievedAt ?? null, source: s?.origin ?? null } })
  })

  // Full index (no per-value source objects). /planets is the M0 contract alias.
  const catalog = (req, res) => {
    const s = ready(res)
    if (!s) return
    sendJson(
      req,
      res,
      { generatedAt: s.meta.retrievedAt, source: s.origin, attribution: SOURCE, count: s.index.length, planets: s.index },
      { etag: `catalog-${s.version}`, cacheKey: `catalog-${s.version}` },
    )
  }
  r.get('/catalog', catalog)
  r.get('/planets', catalog)

  r.get('/planets/:id', (req, res) => {
    const s = ready(res)
    if (!s) return
    const planet = s.byId.get(req.params.id)
    if (!planet) return apiError(res, 404, 'NOT_FOUND', `No planet with id "${req.params.id}".`)
    sendJson(req, res, { planet, system: s.byHost.get(planet.host) ?? [planet] }, { etag: `planet-${req.params.id}-${s.version}` })
  })

  r.get('/systems/:host', (req, res) => {
    const s = ready(res)
    if (!s) return
    const planets = s.byHost.get(req.params.host)
    if (!planets) return apiError(res, 404, 'NOT_FOUND', `No system with host "${req.params.host}".`)
    sendJson(req, res, { host: req.params.host, planets }, { etag: `system-${req.params.host}-${s.version}` })
  })

  return r
}
