// Planetary system → display model — owner: LEAD.
//
// Pure function shared by SystemScene and its overlays. Physical values
// (semi-major axis, period) are resolved here with explicit provenance;
// everything in scene units comes from scale.js and is display-only.

import { isScientific, scienceValue } from '../../contracts/planet.js'
import { hashSeed, visualParams } from '../planet/visualParams.js'
import { displayOrbitSeconds, layoutOrbits, starDisplayRadius } from '../scale.js'
import { blackbodyRGB, NEUTRAL_STAR_RGB } from '../star/starColor.js'

/**
 * How a planet's orbital distance was obtained.
 * - 'catalog':   NASA archive semi-major axis (status: measured | calculated | estimated)
 * - 'kepler':    calculated here from period + stellar mass (Kepler's third law)
 * - 'arbitrary': no usable data; display position is arbitrary
 * @typedef {'catalog'|'kepler'|'arbitrary'} DistanceSource
 */

const DAYS_PER_YEAR = 365.25

// Planets are enlarged further in system views so their surfaces stay legible
// against orbit-scale distances. Display-only; covered by SCALE_NOTES.system.
const SYSTEM_PLANET_SCALE = 1.7

/**
 * Kepler's third law in solar units: a³ [AU] = M★ [M☉] · P² [yr].
 * Planet mass is neglected (M_p ≪ M★ for every catalog planet).
 * Returns null unless both inputs are present.
 * @param {number|null} periodDays
 * @param {number|null} starMassSun
 */
export function keplerSemiMajorAxisAU(periodDays, starMassSun) {
  if (!(periodDays > 0) || !(starMassSun > 0)) return null
  return Math.cbrt(starMassSun * (periodDays / DAYS_PER_YEAR) ** 2)
}

/**
 * @param {import('../../contracts/planet.js').Planet} planet
 * @param {number|null} starMassSun
 * @returns {{ aAU: number|null, source: DistanceSource, status: string }}
 */
export function resolveDistance(planet, starMassSun) {
  if (isScientific(planet.semiMajorAxisAU) && planet.semiMajorAxisAU.value > 0) {
    return { aAU: planet.semiMajorAxisAU.value, source: 'catalog', status: planet.semiMajorAxisAU.status }
  }
  const a = keplerSemiMajorAxisAU(scienceValue(planet.periodDays), starMassSun)
  if (a != null) return { aAU: a, source: 'kepler', status: 'calculated' }
  return { aAU: null, source: 'arbitrary', status: 'arbitrary' }
}

/**
 * @param {import('../../contracts/planet.js').Planet[]} planets  all planets of one host
 */
export function buildSystemModel(planets) {
  const s = planets[0]?.star ?? {}
  const teffK = scienceValue(s.teff)
  const radiusSun = scienceValue(s.radiusSun)
  const massSun = scienceValue(s.massSun)

  const starRadius = starDisplayRadius(radiusSun)
  const colorRGB = blackbodyRGB(teffK)
  const star = {
    name: s.name ?? planets[0]?.host ?? 'Unknown star',
    spectralType: s.spectralType ?? null,
    teffK,
    radiusSun,
    massSun,
    displayRadius: starRadius ?? starDisplayRadius(1),
    imputed: [...(starRadius == null ? ['radius'] : []), ...(colorRGB == null ? ['color'] : [])],
    color: colorRGB ?? [...NEUTRAL_STAR_RGB],
    seed: hashSeed(s.name ?? ''),
  }

  const resolved = planets.map((planet) => {
    const params = visualParams(planet)
    return {
      id: planet.id,
      planet,
      params,
      displayRadius: params.displayRadius.value * SYSTEM_PLANET_SCALE,
      distance: resolveDistance(planet, massSun),
      periodDays: scienceValue(planet.periodDays),
      phase0: hashSeed(planet.name) * Math.PI * 2,
    }
  })

  const layout = layoutOrbits(
    resolved.map((r) => ({ id: r.id, aAU: r.distance.aAU, displayRadius: r.displayRadius })),
    { starRadius: star.displayRadius },
  )

  // Time compression is relative to the system's fastest orbit: the innermost
  // planet takes ~9 s per orbit; others scale as √P, so order is preserved.
  const periods = resolved.map((r) => r.periodDays).filter((p) => p > 0)
  const pMin = periods.length ? Math.min(...periods) : null

  const entries = resolved
    .map((r) => ({
      ...r,
      orbitRadius: layout.get(r.id).radius,
      orbitSeconds:
        r.periodDays && pMin ? displayOrbitSeconds(r.periodDays, { refDays: pMin, refSeconds: 9, min: 6, max: 320 }) : null,
    }))
    .sort((p, q) => p.orbitRadius - q.orbitRadius)

  const outerRadius = entries.length ? Math.max(...entries.map((e) => e.orbitRadius + e.displayRadius)) : star.displayRadius
  const sources = new Set(entries.map((e) => e.distance.source))

  return { host: planets[0]?.host ?? null, star, planets: entries, outerRadius, sources }
}

/**
 * Display angle (radians) of a planet at simulation time t (seconds).
 * Planets without a period stay at their (illustrative) starting angle.
 */
export function orbitAngle(entry, tSeconds) {
  return entry.orbitSeconds ? entry.phase0 + (2 * Math.PI * tSeconds) / entry.orbitSeconds : entry.phase0
}

/**
 * Group a catalog into systems, sorted by planet count (desc), then name.
 * @param {import('../../contracts/planet.js').Planet[]} planets
 */
export function groupByHost(planets) {
  const map = new Map()
  for (const p of planets) map.set(p.host, [...(map.get(p.host) ?? []), p])
  return [...map.entries()]
    .map(([host, list]) => ({ host, planets: list }))
    .sort((a, b) => b.planets.length - a.planets.length || a.host.localeCompare(b.host))
}
