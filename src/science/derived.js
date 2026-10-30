// Values derived from catalog measurements — owner: DATA (implemented by LEAD
// for the planet profile; review welcome). Each function returns null unless
// its inputs are reliable, and returns a Quantity with status 'calculated'
// plus a `basis` string documenting the formula. Uncertainties are
// propagated only where noted.

import { isScientific } from '../contracts/planet.js'

export const G0 = 9.80665 // standard gravity, m/s² (Earth surface reference)
export const PC_TO_LY = 3.26156 // light-years per parsec
export const AU_TO_KM = 149597870.7

/**
 * Eccentricity reported as exactly 0 with no uncertainty: in the source fit
 * the orbit was fixed as circular, so e was assumed, not measured.
 * @param {import('../contracts/planet.js').Quantity} e
 */
export function isFixedCircular(e) {
  return isScientific(e) && e.value === 0 && !e.err
}

/**
 * Directly imaged planets: catalog mass and radius come from evolutionary
 * (cooling) models fitted to the planet's brightness and the system's age,
 * even when the archive labels them as measurements.
 * @param {import('../contracts/planet.js').Planet} planet
 */
export function isModelBasedImaging(planet) {
  return planet.discovery?.method === 'Imaging' && !isScientific(planet.transitMidJD)
}

/** Largest absolute uncertainty, or null. */
const errMag = (q) => (q?.err ? Math.max(Math.abs(q.err[0]), Math.abs(q.err[1])) : null)

/**
 * Surface gravity g = G·M/R², in Earth units scaled by g₀.
 * Requires a *measured* true mass (not M sin i, not mass–radius estimate)
 * and a *measured* radius: gravity from model-based inputs would be circular.
 * Relative uncertainty: σg/g = √((σM/M)² + (2σR/R)²), using the larger
 * side of each asymmetric error.
 * @param {import('../contracts/planet.js').Planet} planet
 */
export function surfaceGravity(planet) {
  const m = planet.massEarth
  const r = planet.radiusEarth
  const reliable =
    !isModelBasedImaging(planet) &&
    isScientific(m) && m.status === 'measured' && m.kind === 'Mass' && !m.limit &&
    isScientific(r) && r.status === 'measured' && !r.limit && r.value > 0
  if (!reliable) return null
  const gEarth = m.value / r.value ** 2
  const value = gEarth * G0
  const out = { value, status: 'calculated', earthRatio: gEarth, basis: 'g = G·M/R² from measured mass and radius' }
  const sm = errMag(m)
  const sr = errMag(r)
  if (sm != null && sr != null) {
    const rel = Math.sqrt((sm / m.value) ** 2 + ((2 * sr) / r.value) ** 2)
    out.err = [value * rel, -value * rel]
  }
  return out
}

/**
 * Periastron q = a(1 − e) and apoastron Q = a(1 + e), in AU.
 * Requires both a and e from the catalog, with e actually measured (not
 * fixed to 0 in the fit). Uncertainty not propagated.
 * @param {import('../contracts/planet.js').Planet} planet
 */
export function orbitalExtremes(planet) {
  const a = planet.semiMajorAxisAU
  const e = planet.eccentricity
  if (!isScientific(a) || !isScientific(e) || e.limit || a.limit || isFixedCircular(e)) return null
  if (!(a.value > 0) || e.value < 0 || e.value >= 1) return null
  const basis = (sign) => `a(1 ${sign} e), a = ${a.value} AU, e = ${e.value}; uncertainty not propagated`
  return {
    periastron: { value: a.value * (1 - e.value), status: 'calculated', basis: basis('−') },
    apoastron: { value: a.value * (1 + e.value), status: 'calculated', basis: basis('+') },
  }
}

/**
 * Distance in light-years from the catalog distance in parsecs.
 * @param {import('../contracts/planet.js').Quantity} distancePc
 */
export function distanceLightYears(distancePc) {
  if (!isScientific(distancePc)) return null
  const out = { value: distancePc.value * PC_TO_LY, status: 'calculated', basis: '1 pc = 3.26156 ly' }
  if (distancePc.err) out.err = distancePc.err.map((e) => e * PC_TO_LY)
  return out
}
