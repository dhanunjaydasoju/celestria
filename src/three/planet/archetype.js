// Visual archetype classification — owner: LEAD.
//
// Chooses *how to draw* a planet from the measurements that exist. It is a
// rendering decision, not a scientific classification: thresholds are the
// commonly used population boundaries (e.g. the ~1.6 R⊕ rocky/volatile
// transition, Rogers 2015) and every decision records the value it was based
// on so the UI can show it. Imputed values are never used (scienceValue).

import { scienceValue } from '../../contracts/planet.js'

export const ARCHETYPES = Object.freeze({
  ROCKY: 'rocky',
  SUB_NEPTUNE: 'subNeptune',
  NEPTUNE: 'neptune',
  GIANT: 'giant',
  UNCLASSIFIED: 'unclassified',
})

export const THERMAL = Object.freeze({
  SCORCHING: 'scorching', // > 1000 K
  HOT: 'hot', //             500–1000 K
  WARM: 'warm', //           350–500 K
  TEMPERATE: 'temperate', // 200–350 K
  COLD: 'cold', //           < 200 K
  UNKNOWN: 'unknown',
})

export const ARCHETYPE_LABELS = {
  rocky: 'Rocky world',
  subNeptune: 'Sub-Neptune',
  neptune: 'Neptune-like',
  giant: 'Gas giant',
  unclassified: 'Unclassified',
}

export const THERMAL_LABELS = {
  scorching: 'Scorching',
  hot: 'Hot',
  warm: 'Warm',
  temperate: 'Temperate',
  cold: 'Cold',
  unknown: 'Temperature unknown',
}

// Equilibrium temperature of a zero-albedo body with full heat redistribution
// receiving Earth's insolation: T = (S⊕ / 4σ)^¼ ≈ 278.6 K, scaling as S^¼.
const EARTH_FLUX_TEQ_K = 278.6

/**
 * @typedef {Object} Basis
 * @property {string} field     Planet field used, e.g. 'radiusEarth'
 * @property {number} value
 * @property {string} status    provenance of that value
 * @property {string} [note]    e.g. 'minimum mass'
 */

/**
 * @param {import('../../contracts/planet.js').Planet} planet
 * @returns {{ type: string, sizeBasis: Basis|null }}
 */
export function classifySize(planet) {
  const r = scienceValue(planet.radiusEarth)
  if (r != null && r > 0) {
    const type =
      r < 1.6 ? ARCHETYPES.ROCKY : r < 4 ? ARCHETYPES.SUB_NEPTUNE : r < 8 ? ARCHETYPES.NEPTUNE : ARCHETYPES.GIANT
    return { type, sizeBasis: { field: 'radiusEarth', value: r, status: planet.radiusEarth.status } }
  }
  const m = scienceValue(planet.massEarth)
  if (m != null && m > 0) {
    const type =
      m < 2 ? ARCHETYPES.ROCKY : m < 10 ? ARCHETYPES.SUB_NEPTUNE : m < 50 ? ARCHETYPES.NEPTUNE : ARCHETYPES.GIANT
    const note = planet.massEarth.kind === 'Msini' ? 'minimum mass' : undefined
    return { type, sizeBasis: { field: 'massEarth', value: m, status: planet.massEarth.status, note } }
  }
  return { type: ARCHETYPES.UNCLASSIFIED, sizeBasis: null }
}

/**
 * @param {import('../../contracts/planet.js').Planet} planet
 * @returns {{ band: string, temperatureK: number|null, thermalBasis: Basis|null }}
 */
export function classifyThermal(planet) {
  let t = scienceValue(planet.eqTempK)
  let thermalBasis = t != null ? { field: 'eqTempK', value: t, status: planet.eqTempK.status } : null
  if (t == null) {
    const s = scienceValue(planet.insolationEarth)
    if (s != null && s > 0) {
      t = EARTH_FLUX_TEQ_K * s ** 0.25
      thermalBasis = {
        field: 'insolationEarth',
        value: s,
        status: planet.insolationEarth.status,
        note: 'temperature calculated from insolation, zero albedo',
      }
    }
  }
  return { band: thermalBand(t), temperatureK: t, thermalBasis }
}

/** @param {number|null} t  kelvin */
export function thermalBand(t) {
  if (t == null || !Number.isFinite(t)) return THERMAL.UNKNOWN
  if (t > 1000) return THERMAL.SCORCHING
  if (t > 500) return THERMAL.HOT
  if (t > 350) return THERMAL.WARM
  if (t >= 200) return THERMAL.TEMPERATE
  return THERMAL.COLD
}
