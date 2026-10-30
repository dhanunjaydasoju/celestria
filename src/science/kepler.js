// Orbital mechanics for the Orbital Simulator — owner: LEAD.
//
// Two-body Keplerian orbits: Kepler's equation for position in time, the
// vis-viva equation for speed. Pure functions, unit tested (kepler.test.js).
// Every assumption made to fill a gap is returned in `assumptions` so the UI
// can show it; nothing is silently invented.
//
// Conventions
// - Times are Julian Dates in the catalog's BJD_TDB scale (days).
// - ω (pl_orblper) is the planet's argument of periastron; a transit occurs
//   at true anomaly ν = 90° − ω. Verified on HD 80606 b: this reproduces the
//   catalog time of periastron from the transit midpoint to 0.01 h.
// - Planet mass is neglected next to the star's (M_p ≪ M★).

import { isScientific } from '../contracts/planet.js'
import { isFixedCircular } from './derived.js'

export const GM_SUN = 1.32712440018e11 // km³/s², IAU nominal solar mass parameter
export const AU_KM = 149597870.7
export const R_SUN_KM = 695700
export const DAY_S = 86400
export const EARTH_ORBITAL_SPEED = 29.78 // km/s, mean
const TWO_PI = Math.PI * 2
const DEG = Math.PI / 180

/** Wrap an angle to [−π, π). */
export function wrapPi(x) {
  return x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI)
}

/** Wrap an angle to [0, 2π). */
export function wrap2Pi(x) {
  return x - TWO_PI * Math.floor(x / TWO_PI)
}

/**
 * Solve Kepler's equation M = E − e·sin E for the eccentric anomaly E.
 * Newton–Raphson from a starting guess that converges for all 0 ≤ e < 1
 * (E₀ = π for e > 0.8), with a bisection fallback. |residual| < 1e-12.
 * @param {number} M  mean anomaly, radians (any value)
 * @param {number} e  eccentricity, 0 ≤ e < 1
 * @returns {number} E in [−π, π]
 */
export function solveKepler(M, e) {
  const m = wrapPi(M)
  if (e < 1e-12) return m
  let E = e > 0.8 ? Math.PI * Math.sign(m || 1) : m + e * Math.sin(m)
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - m
    const d = f / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-14) return E
  }
  // Fallback: f(E) is monotonic on [−π, π], so bisection always converges.
  let lo = -Math.PI
  let hi = Math.PI
  for (let i = 0; i < 200; i++) {
    E = (lo + hi) / 2
    if (E - e * Math.sin(E) - m > 0) hi = E
    else lo = E
  }
  return E
}

/** True anomaly ν from eccentric anomaly E. */
export function trueFromEccentric(E, e) {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

/** Eccentric anomaly E from true anomaly ν. */
export function eccentricFromTrue(nu, e) {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
}

/** Mean anomaly from eccentric anomaly (Kepler's equation). */
export function meanFromEccentric(E, e) {
  return E - e * Math.sin(E)
}

/** Vis-viva: v = √(GM(2/r − 1/a)). r, a in km; GM in km³/s². Returns km/s. */
export function visViva(gm, rKm, aKm) {
  return Math.sqrt(gm * (2 / rKm - 1 / aKm))
}

/** Kepler's third law: a [AU] = (M★[M☉] · P[yr]²)^(1/3). */
export function keplerA(periodDays, starMassSun) {
  return Math.cbrt(starMassSun * (periodDays / 365.25) ** 2)
}

const errMax = (q) => (q?.err ? Math.max(Math.abs(q.err[0]), Math.abs(q.err[1])) : null)

/**
 * @typedef {Object} Assumption
 * @property {string} key
 * @property {string} text
 */

/**
 * Resolve the orbital elements the simulator needs from a catalog planet.
 * Returns null when no orbital period is available (nothing to simulate).
 *
 * @param {import('../contracts/planet.js').Planet} planet
 */
export function orbitalElements(planet) {
  const Pq = planet.periodDays
  if (!isScientific(Pq) || !(Pq.value > 0)) return null
  const P = Pq.value
  const assumptions = []

  const starMass = isScientific(planet.star?.massSun) && planet.star.massSun.value > 0 ? planet.star.massSun.value : null
  const gm = starMass != null ? starMass * GM_SUN : null

  // Semi-major axis: catalog, else Kepler III, else a normalised orbit (a = 1).
  let a = null
  let aSource = null
  if (isScientific(planet.semiMajorAxisAU) && planet.semiMajorAxisAU.value > 0) {
    a = planet.semiMajorAxisAU.value
    aSource = 'catalog'
  } else if (starMass != null) {
    a = keplerA(P, starMass)
    aSource = 'kepler'
    assumptions.push({ key: 'a-kepler', text: "Semi-major axis calculated from period and star mass (Kepler's third law)" })
  } else {
    a = 1
    aSource = 'normalised'
    assumptions.push({ key: 'a-unknown', text: 'Orbit size unknown: shape shown on a relative scale; distances and speeds unavailable' })
  }

  // Eccentricity.
  const eq = planet.eccentricity
  let e = 0
  let eStatus = 'missing'
  if (isFixedCircular(eq)) {
    eStatus = 'assumed'
    assumptions.push({ key: 'e-assumed', text: 'Circular orbit: eccentricity was fixed at 0 in the source analysis, not measured' })
  } else if (isScientific(eq) && eq.value >= 0 && eq.value < 1) {
    e = eq.value
    eStatus = 'measured'
  } else {
    assumptions.push({ key: 'e-missing', text: 'Circular orbit assumed: eccentricity not available in the catalog' })
  }

  // Argument of periastron. Only matters for an ellipse's orientation and for
  // locating the transit; for a circle we define ω = 90° (transit at ν = 0).
  let omega = 90 * DEG
  let omegaStatus = 'assumed'
  if (e > 0 && isScientific(planet.periastronArgDeg)) {
    omega = planet.periastronArgDeg.value * DEG
    omegaStatus = 'catalog'
  } else if (e > 0) {
    assumptions.push({ key: 'omega-assumed', text: 'Orientation of the ellipse unknown: drawn with ω = 90° (illustrative)' })
  }

  const inclinationDeg = isScientific(planet.inclinationDeg) ? planet.inclinationDeg.value : null

  // Phase anchor. A transit midpoint is a direct observation, so it is
  // preferred; a time of periastron is only meaningful for a measured ellipse.
  const Tc = isScientific(planet.transitMidJD) ? planet.transitMidJD : null
  const Tp = eStatus === 'measured' && e > 0 && isScientific(planet.periastronTimeJD) ? planet.periastronTimeJD : null
  let anchor = { kind: 'none', tp: 0, epoch: null, epochErr: null, approximate: false, consistency: null }

  if (Tc) {
    const nuT = Math.PI / 2 - omega
    const Mt = meanFromEccentric(eccentricFromTrue(nuT, e), e)
    const tp = Tc.value - (Mt / TWO_PI) * P
    anchor = {
      kind: 'transit',
      tp,
      epoch: Tc.value,
      epochErr: errMax(Tc),
      approximate: e > 0 && omegaStatus !== 'catalog',
      consistency: null,
    }
    if (Tp && e >= 0.1) {
      // Cross-check against the catalog periastron time (sources can differ).
      // Skipped for near-circular orbits, where periastron time is ill-defined.
      const diff = wrapPi(((Tp.value - tp) / P) * TWO_PI) / TWO_PI // orbits
      anchor.consistency = { diffDays: diff * P, diffFraction: Math.abs(diff) }
    }
    if (anchor.approximate) {
      assumptions.push({ key: 'anchor-approx', text: 'Timing anchored to the transit, but the ellipse orientation is assumed, so dates are approximate' })
    }
  } else if (Tp) {
    anchor = { kind: 'periastron', tp: Tp.value, epoch: Tp.value, epochErr: errMax(Tp), approximate: false, consistency: null }
  } else {
    assumptions.push({ key: 'phase-unanchored', text: 'Orbital phase not tied to real dates: the starting point is arbitrary' })
  }

  return {
    P,
    periodErr: errMax(Pq),
    a,
    aSource,
    e,
    eStatus,
    omega,
    omegaStatus,
    inclinationDeg,
    starMassSun: starMass,
    gm,
    starRadiusAU: isScientific(planet.star?.radiusSun) ? (planet.star.radiusSun.value * R_SUN_KM) / AU_KM : null,
    anchor,
    transits: Tc != null,
    assumptions,
  }
}

/**
 * Position and velocity at time t.
 * @param {ReturnType<typeof orbitalElements>} el
 * @param {number} t  JD (anchored) or simulation days (unanchored; tp = 0)
 */
export function orbitState(el, t) {
  const M = wrap2Pi((TWO_PI * (t - el.anchor.tp)) / el.P)
  const E = solveKepler(M, el.e)
  const nu = trueFromEccentric(E, el.e)
  const r = el.a * (1 - el.e * Math.cos(E))
  const theta = nu + el.omega // angle from the reference direction in the orbital plane

  // Velocity direction in the orbital plane (radial + transverse components).
  const p = el.a * (1 - el.e * el.e)
  const vr = el.e * Math.sin(nu)
  const vt = 1 + el.e * Math.cos(nu)
  const vxu = vr * Math.cos(theta) - vt * Math.sin(theta)
  const vyu = vr * Math.sin(theta) + vt * Math.cos(theta)
  const vlen = Math.hypot(vxu, vyu) || 1

  const physical = el.gm != null && el.aSource !== 'normalised'
  return {
    meanAnomaly: M,
    phase: M / TWO_PI,
    eccentricAnomaly: E,
    trueAnomaly: wrap2Pi(nu),
    rAU: r,
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    vDir: [vxu / vlen, vyu / vlen],
    speedKmS: physical ? visViva(el.gm, r * AU_KM, el.a * AU_KM) : null,
    semiLatusRectum: p,
  }
}

/** Periastron/apoastron distances (AU) and speeds (km/s, null if unknown). */
export function orbitExtremes(el) {
  const q = el.a * (1 - el.e)
  const Q = el.a * (1 + el.e)
  const physical = el.gm != null && el.aSource !== 'normalised'
  return {
    periastronAU: q,
    apoastronAU: Q,
    speedPeriKmS: physical ? visViva(el.gm, q * AU_KM, el.a * AU_KM) : null,
    speedApoKmS: physical ? visViva(el.gm, Q * AU_KM, el.a * AU_KM) : null,
  }
}

/** Phase (0–1, from periastron) at which transits occur, or null. */
export function transitPhase(el) {
  if (!el.transits) return null
  const nuT = Math.PI / 2 - el.omega
  return wrap2Pi(meanFromEccentric(eccentricFromTrue(nuT, el.e), el.e)) / TWO_PI
}

/**
 * Timing uncertainty of the predicted position at time t:
 * σ_t = √(σ_epoch² + (N·σ_P)²), N = orbits between the reference epoch and t.
 * `complete` is false when the epoch uncertainty is not in the dataset (then
 * σ_t is a lower bound from the period uncertainty only).
 * Returns null when it cannot be assessed (unanchored, or no period error).
 */
export function timingUncertainty(el, t) {
  if (el.anchor.kind === 'none' || el.periodErr == null) return null
  const n = Math.abs(t - el.anchor.epoch) / el.P
  const fromPeriod = n * el.periodErr
  const complete = el.anchor.epochErr != null
  const sigmaDays = Math.sqrt((el.anchor.epochErr ?? 0) ** 2 + fromPeriod ** 2)
  return { sigmaDays, fractionOfOrbit: sigmaDays / el.P, orbitsFromEpoch: n, complete }
}

/** Maximum phase uncertainty (fraction of an orbit) for claiming a real-date position. */
export const RELIABLE_FRACTION = 0.05
/** Stricter limit when the epoch uncertainty is missing (σ is a lower bound). */
export const RELIABLE_FRACTION_PARTIAL = 0.01

/**
 * Whether a real-date position at time t can honestly be shown.
 * @returns {{ ok: boolean, reason: string|null, uncertainty: ReturnType<typeof timingUncertainty> }}
 */
export function realDateReliability(el, t) {
  if (el.anchor.kind === 'none') return { ok: false, reason: 'Orbital phase is not tied to real dates', uncertainty: null }
  if (el.anchor.approximate) return { ok: false, reason: 'Ellipse orientation is assumed, so real dates would be approximate', uncertainty: null }
  if (el.anchor.consistency && el.anchor.consistency.diffFraction > RELIABLE_FRACTION) {
    return { ok: false, reason: 'Catalog transit and periastron times disagree', uncertainty: null }
  }
  const u = timingUncertainty(el, t)
  if (!u) return { ok: false, reason: 'Period uncertainty not reported, so the timing error cannot be assessed', uncertainty: null }
  const limit = u.complete ? RELIABLE_FRACTION : RELIABLE_FRACTION_PARTIAL
  if (u.fractionOfOrbit > limit) {
    return { ok: false, reason: `Timing uncertainty (±${u.sigmaDays.toPrecision(2)} d) exceeds ${limit * 100}% of an orbit`, uncertainty: u }
  }
  return { ok: true, reason: null, uncertainty: u }
}

/** Julian Date from a JS Date (UTC). BJD_TDB differs by < 10 min; negligible here. */
export function jdFromDate(date) {
  return date.getTime() / 86400000 + 2440587.5
}

/** JS Date (UTC) from a Julian Date. */
export function dateFromJd(jd) {
  return new Date((jd - 2440587.5) * 86400000)
}
