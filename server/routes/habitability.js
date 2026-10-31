// Habitability dashboard data — owner: AI (implemented by LEAD in M5 Phase B).
//
//   GET /api/habitability → { generatedAt, count, summary, coverage, planets }
//
// Computed server-side from full canonical records (with uncertainties) by
// src/science/habitability.js; cached per catalogue version. `planets`
// holds the planets with an estimated placement (the plottable ones); all
// planets are counted in `summary`. No scores: categories only.

import { Router } from 'express'
import { assessHabitability } from '../../src/science/habitability.js'
import { apiError, sendJson } from '../http/sendJson.js'

const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(4)))
const errPair = (q) => (q?.err ? [r4(Math.abs(q.err[0])), r4(Math.abs(q.err[1]))] : null)

/** Compact dashboard row for one planet (only canonical or calculated values). */
export function habitabilityRow(planet) {
  const a = assessHabitability(planet)
  const z = a.zone
  const size = a.factors.find((f) => f.key === 'size')
  const mass = planet.massEarth
  return {
    id: planet.id,
    name: planet.name,
    host: planet.host,
    tier: a.tier.key,
    zoneStatus: z.status,
    placement: z.placement ?? null,
    straddles: Boolean(z.straddles),
    crossesBoundary: Boolean(z.orbit?.crossesBoundary),
    flux: z.flux ? { value: r4(z.flux.value), err: errPair(z.flux), status: z.flux.status, calculated: Boolean(z.flux.basis?.startsWith('S =')), limit: z.flux.limit ?? null } : null,
    teff: z.teff?.value != null && z.teff.status !== 'imputed' && z.teff.status !== 'missing' ? { value: r4(z.teff.value), err: errPair(z.teff), status: z.teff.status } : null,
    radius: planet.radiusEarth?.value != null && planet.radiusEarth.status !== 'imputed' && planet.radiusEarth.status !== 'missing' ? { value: r4(planet.radiusEarth.value), err: errPair(planet.radiusEarth), status: planet.radiusEarth.status } : null,
    mass: mass?.value != null && mass.status !== 'imputed' && mass.status !== 'missing' ? { value: r4(mass.value), kind: mass.kind ?? null, status: mass.status } : null,
    sizeStatus: size.status,
    spectralType: planet.star?.spectralType ?? null,
  }
}

export function habitabilityDataset(state) {
  const rows = state.planets.map(habitabilityRow)
  const count = (key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {})
  const placed = rows.filter((r) => r.zoneStatus === 'placed')
  return {
    generatedAt: state.meta.retrievedAt,
    count: rows.length,
    summary: {
      tiers: count('tier'),
      zoneStatus: count('zoneStatus'),
      placements: placed.reduce((m, r) => ((m[r.placement] = (m[r.placement] ?? 0) + 1), m), {}),
      straddling: placed.filter((r) => r.straddles).length,
    },
    coverage: {
      fluxCatalogue: rows.filter((r) => r.flux && !r.flux.calculated).length,
      fluxCalculated: rows.filter((r) => r.flux?.calculated).length,
      fluxMissing: rows.filter((r) => !r.flux).length,
      teffMissing: rows.filter((r) => !r.teff).length,
      teffUnsupported: rows.filter((r) => r.zoneStatus === 'unsupported_teff').length,
      evolvedStar: rows.filter((r) => r.zoneStatus === 'unsupported_star').length,
    },
    planets: placed,
  }
}

/** @param {ReturnType<typeof import('../nasa/catalogStore.js').createCatalogStore>} store */
export function habitabilityRouter(store) {
  const r = Router()
  let cache = null
  r.get('/habitability', (req, res) => {
    const s = store.get()
    if (!s) return apiError(res, 503, 'UNAVAILABLE', 'Catalogue is loading.')
    if (cache?.version !== s.version) cache = { version: s.version, data: habitabilityDataset(s) }
    sendJson(req, res, cache.data, { etag: `habitability-${s.version}`, cacheKey: `habitability-${s.version}` })
  })
  return r
}
