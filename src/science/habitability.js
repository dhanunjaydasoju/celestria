// Habitability indicators — owner: AI (implemented by LEAD in M5 Phase B;
// pending Teammate 4 science review). Methodology: docs/science/habitability.md
//
// A transparent, factor-by-factor assessment of *conditions that are
// commonly discussed* for surface liquid water on a rocky planet. It never
// produces a score or probability, never claims habitability or life, and
// reads values only through scienceValue() so median-imputed values can
// never enter (CLAUDE.md §5a). Atmosphere is always unknown: the NASA
// catalogue has no atmospheric data.

import { isScientific, scienceValue } from '../contracts/planet.js'
import { isModelBasedImaging, surfaceGravity } from './derived.js'
import { habitableZoneFlux, PLACEMENT_LABELS, placementForFlux, REFERENCE as KOPPARAPU, TEFF_MAX_K, TEFF_MIN_K, teffSupported, habitableZone } from './habitableZone.js'

/** Thresholds (documented for review in docs/science/habitability.md). */
export const RULES = Object.freeze({
  rockyRadiusMax: 1.6, //     R⊕ — population transition (Rogers 2015; Fulton et al. 2017 radius gap)
  volatileRadiusMin: 2.5, //  R⊕ — above this most planets keep thick volatile envelopes (CLAUDE.md F6A)
  massMin: 0.1, //            M⊕ — lower end of the planet masses modelled for habitable zones (Kopparapu et al. 2014)
  massMax: 10, //             M⊕ — conventional upper bound for rocky planets (CLAUDE.md F6A)
  mDwarfTeffMax: 3900, //     K  — M-dwarf caveats (flares, tidal locking) when no spectral type is listed
  eccentricNote: 0.1, //      e  — note orbital flux variation at or above this measured eccentricity
})

export const STATUS_LABELS = { favorable: 'Favourable', uncertain: 'Uncertain', unfavorable: 'Unfavourable', unknown: 'Unknown', context: 'Context only' }

export const DISCLAIMER = 'Habitable-zone placement is not evidence of habitability or life. These indicators describe a few conditions using catalogue values; atmospheres, surfaces and water are unknown.'

const REFS = {
  kopparapu: KOPPARAPU,
  rogers: { label: 'Rogers 2015', url: 'https://arxiv.org/abs/1407.4457' },
  fulton: { label: 'Fulton et al. 2017', url: 'https://arxiv.org/abs/1703.10375' },
  shields: { label: 'Shields et al. 2016', url: 'https://arxiv.org/abs/1610.05765' },
}

const errs = (q) => (q?.err ? [Math.abs(q.err[0]), Math.abs(q.err[1])] : [0, 0])
/** [low, nominal, high] using the asymmetric uncertainty (no uncertainty → a point). */
const interval = (q) => {
  const v = scienceValue(q)
  if (v == null) return null
  const [plus, minus] = errs(q)
  return [v - minus, v, v + plus]
}
// Inputs carry only canonical or calculated values; an imputed one reads as missing.
const input = (label, quantity, unit) => ({ label, quantity: isScientific(quantity) ? quantity : { value: null, status: 'missing' }, unit })

/**
 * Stellar flux received by the planet (S⊕): the catalogue value, or
 * calculated from the catalogue luminosity and semi-major axis.
 * @returns {object|null} a Quantity with status, err and basis
 */
export function planetFlux(planet) {
  if (isScientific(planet.insolationEarth)) {
    return { ...planet.insolationEarth, basis: 'NASA catalogue insolation' }
  }
  const lum = planet.star?.lumLog
  const a = planet.semiMajorAxisAU
  if (!isScientific(lum) || !isScientific(a) || lum.limit || a.limit || !(a.value > 0)) return null
  // S = (L★/L☉) / (a/AU)²; relative error √((ln10·σlogL)² + (2σa/a)²), larger side of each.
  const value = 10 ** lum.value / a.value ** 2
  const out = { value, status: 'calculated', basis: 'S = (L★/L☉)/(a/AU)² from catalogue luminosity and semi-major axis' }
  if (lum.err && a.err) {
    const rel = Math.sqrt((Math.LN10 * Math.max(...errs(lum))) ** 2 + ((2 * Math.max(...errs(a))) / a.value) ** 2)
    out.err = [value * rel, -value * rel]
  }
  return out
}

/**
 * MK luminosity class from a spectral type ("G8 III" → 'III', "K2 V" → 'V'),
 * or null when none is listed (most catalogue hosts).
 */
export function luminosityClass(spectralType) {
  const m = /[OBAFGKM]\d*(?:\.\d+)?\s*(Ia|Iab|Ib|III|II|IV|V|I)(?![a-z])/i.exec(spectralType ?? '')
  return m ? m[1].toUpperCase().replace('IAB', 'Iab').replace('IA', 'Ia').replace('IB', 'Ib') : null
}

/** Habitable-zone evaluation for one planet (no judgement about habitability). */
export function evaluateZone(planet) {
  const teffQ = planet.star?.teff
  const teff = interval(teffQ)
  const flux = planetFlux(planet)
  const lumClass = luminosityClass(planet.star?.spectralType)
  const base = { teff: isScientific(teffQ) ? teffQ : null, flux, reference: KOPPARAPU, luminosityClass: lumClass }
  if (!teff) return { ...base, status: 'no_teff', reason: 'No stellar effective temperature in the catalogue.' }
  // The boundaries are computed for main-sequence stars (Kopparapu et al. 2014).
  if (lumClass && /^(I|Ia|Iab|Ib|II|III)$/.test(lumClass)) {
    return { ...base, status: 'unsupported_star', reason: `The host is an evolved star (luminosity class ${lumClass}); the Kopparapu et al. 2014 boundaries apply to main-sequence stars.` }
  }
  if (!teffSupported(teff[1])) {
    return { ...base, status: 'unsupported_teff', reason: `The Kopparapu et al. 2014 boundaries are defined only for stars of ${TEFF_MIN_K.toLocaleString('en-US')}–${TEFF_MAX_K.toLocaleString('en-US')} K; this star is ${Math.round(teff[1]).toLocaleString('en-US')} K.` }
  }
  const bounds = habitableZoneFlux(teff[1])
  const lumLog = scienceValue(planet.star?.lumLog)
  const distancesAU = habitableZone(teff[1], lumLog)
  const zone = { ...base, bounds, distancesAU, boundsBasis: `Kopparapu et al. 2014 boundary fluxes at Teff = ${Math.round(teff[1])} K` }
  if (!flux) return { ...zone, status: 'no_flux', reason: 'Neither a catalogue insolation nor a luminosity and semi-major axis to calculate it are available.' }

  // Upper/lower limits: only a one-sided statement may be possible.
  if (flux.limit) {
    const p = placementForFlux(flux.value, bounds)
    const decisive = (flux.limit === '<' && p === 'cold') || (flux.limit === '>' && p === 'hot')
    return { ...zone, status: 'limit', placement: decisive ? p : null, straddles: !decisive, reason: `The catalogue gives only ${flux.limit === '<' ? 'an upper' : 'a lower'} limit on the flux.` }
  }

  // Placements across the flux uncertainty and the boundary shift from the Teff uncertainty.
  const f = interval(flux)
  const teffs = [teff[0], teff[1], teff[2]].filter(teffSupported)
  const seen = new Set()
  for (const t of teffs) for (const s of f) seen.add(placementForFlux(s, habitableZoneFlux(t)))
  const placement = placementForFlux(flux.value, bounds)
  const placementsWithinUncertainty = PLACEMENT_ORDER.filter((p) => seen.has(p))

  // Eccentric orbits: flux varies between periastron (S/(1−e)²) and apoastron (S/(1+e)²).
  const e = planet.eccentricity
  let orbit = null
  if (isScientific(e) && e.status !== 'missing' && !e.limit && e.value >= RULES.eccentricNote && e.value < 1 && e.err) {
    const peri = flux.value / (1 - e.value) ** 2
    const apo = flux.value / (1 + e.value) ** 2
    const span = new Set([placementForFlux(peri, bounds), placementForFlux(apo, bounds)])
    orbit = { eccentricity: e.value, periastronFlux: peri, apoastronFlux: apo, crossesBoundary: span.size > 1 || !span.has(placement) }
  }
  return { ...zone, status: 'placed', placement, placementLabel: PLACEMENT_LABELS[placement], placementsWithinUncertainty, straddles: placementsWithinUncertainty.length > 1, orbit, subgiant: lumClass === 'IV' }
}
const PLACEMENT_ORDER = ['hot', 'optimistic_inner', 'conservative', 'optimistic_outer', 'cold']

function fluxFactor(zone) {
  const inputs = [input('Stellar flux', zone.flux, 'S⊕'), input('Star effective temperature', zone.teff, 'K')]
  const f = { key: 'flux', label: 'Habitable-zone placement (stellar flux)', inputs, reference: KOPPARAPU, rule: 'Conservative zone: between the runaway-greenhouse and maximum-greenhouse fluxes; optimistic zone: between Recent Venus and Early Mars (Kopparapu et al. 2014, 1 M⊕).' }
  if (zone.status !== 'placed' && zone.status !== 'limit') return { ...f, status: 'unknown', explanation: zone.reason }
  if (zone.status === 'limit') {
    return zone.placement
      ? { ...f, status: 'unfavorable', explanation: `${zone.reason} Even so, it is ${zone.placement === 'cold' ? 'below the optimistic outer edge' : 'above the optimistic inner edge'}.` }
      : { ...f, status: 'uncertain', explanation: `${zone.reason} Placement cannot be determined.` }
  }
  const label = PLACEMENT_LABELS[zone.placement]
  const within = zone.straddles ? ` Within the uncertainties it could also be: ${zone.placementsWithinUncertainty.filter((p) => p !== zone.placement).map((p) => PLACEMENT_LABELS[p].toLowerCase()).join('; ')}.` : ''
  const orbit = zone.orbit?.crossesBoundary ? ' Its eccentric orbit carries it across a boundary between periastron and apoastron.' : ''
  let status
  if (zone.placement === 'conservative') status = zone.straddles || zone.orbit?.crossesBoundary ? 'uncertain' : 'favorable'
  else if (zone.placement === 'hot' || zone.placement === 'cold') status = zone.straddles ? 'uncertain' : 'unfavorable'
  else status = 'uncertain'
  const subgiant = zone.subgiant ? ' The host is a subgiant (class IV), slightly evolved beyond the main sequence the model assumes.' : ''
  if (zone.subgiant && status === 'favorable') status = 'uncertain'
  return { ...f, status, placement: zone.placement, explanation: `${label}.${within}${orbit}${subgiant} This is an estimate from stellar flux for an Earth-like atmosphere, not a measurement of the planet.` }
}

function sizeFactor(planet) {
  const q = planet.radiusEarth
  const f = { key: 'size', label: 'Size (radius)', inputs: [input('Radius', q, 'R⊕')], reference: REFS.rogers, rule: `≤ ${RULES.rockyRadiusMax} R⊕: within the range where most known planets are rocky; ${RULES.rockyRadiusMax}–${RULES.volatileRadiusMin} R⊕: transition; > ${RULES.volatileRadiusMin} R⊕: most known planets have thick volatile envelopes. Population trends, not compositions.` }
  const r = interval(q)
  if (!r) return { ...f, status: 'unknown', explanation: 'No radius in the catalogue.' }
  if (q.limit) return { ...f, status: 'uncertain', explanation: `The catalogue gives only ${q.limit === '<' ? 'an upper' : 'a lower'} limit on the radius.` }
  const cls = (v) => (v <= RULES.rockyRadiusMax ? 'small' : v <= RULES.volatileRadiusMin ? 'mid' : 'large')
  const classes = new Set(r.map(cls))
  const nominal = cls(r[1])
  let status = nominal === 'small' ? 'favorable' : nominal === 'large' ? 'unfavorable' : 'uncertain'
  const notes = []
  if (classes.size > 1) {
    status = 'uncertain'
    notes.push('its uncertainty spans a size threshold')
  }
  if (q.status === 'calculated') {
    if (status === 'favorable' || status === 'unfavorable') status = 'uncertain'
    notes.push('the radius was calculated by NASA from other values, not measured directly')
  }
  if (isModelBasedImaging(planet)) {
    if (status !== 'unknown') status = 'uncertain'
    notes.push('the radius of a directly imaged planet comes from evolutionary models')
  }
  const text = {
    small: `At or below ${RULES.rockyRadiusMax} R⊕, the range where most known planets with measured masses are rocky.`,
    mid: `Between ${RULES.rockyRadiusMax} and ${RULES.volatileRadiusMin} R⊕, where planets may be rocky or keep volatile envelopes.`,
    large: `Above ${RULES.volatileRadiusMin} R⊕; most known planets this large have thick hydrogen/helium or volatile envelopes.`,
  }[nominal]
  return { ...f, status, explanation: `${text}${notes.length ? ` Uncertain because ${notes.join(', and ')}.` : ''} This is a population trend, not a measured composition.` }
}

function massFactor(planet) {
  const q = planet.massEarth
  const f = { key: 'mass', label: 'Mass', inputs: [input(q?.kind === 'Msini' ? 'Minimum mass (M sin i)' : 'Mass', q, 'M⊕')], reference: REFS.kopparapu, rule: `${RULES.massMin}–${RULES.massMax} M⊕: the range conventionally considered for rocky planets. M sin i is a lower limit; mass–radius estimates are not measurements.` }
  const m = interval(q)
  if (!m) return { ...f, status: 'unknown', explanation: 'No mass in the catalogue.' }
  if (q.kind === 'Msini') {
    return m[1] > RULES.massMax
      ? { ...f, status: 'unfavorable', explanation: `Even the minimum mass (M sin i) exceeds ${RULES.massMax} M⊕; the true mass is this value or larger.` }
      : { ...f, status: 'uncertain', explanation: 'Only a minimum mass (M sin i) is known; the true mass could be larger, depending on the unknown orbital tilt.' }
  }
  if (q.kind === 'M-R' || q.status === 'estimated') {
    return { ...f, status: 'uncertain', explanation: "The mass was estimated from the radius with NASA's mass–radius relation, not measured." }
  }
  if (q.limit) return { ...f, status: 'uncertain', explanation: `The catalogue gives only ${q.limit === '<' ? 'an upper' : 'a lower'} limit on the mass.` }
  const inRange = (v) => v >= RULES.massMin && v <= RULES.massMax
  const all = m.every(inRange)
  const none = m.every((v) => !inRange(v)) && (m[2] < RULES.massMin || m[0] > RULES.massMax)
  if (isModelBasedImaging(planet)) {
    return { ...f, status: m[1] > RULES.massMax ? 'unfavorable' : 'uncertain', explanation: `The mass of a directly imaged planet comes from evolutionary models${m[1] > RULES.massMax ? ` and is far above ${RULES.massMax} M⊕` : ''}.` }
  }
  if (all) return { ...f, status: 'favorable', explanation: `Within ${RULES.massMin}–${RULES.massMax} M⊕, including its uncertainty.` }
  if (none) return { ...f, status: 'unfavorable', explanation: `Outside ${RULES.massMin}–${RULES.massMax} M⊕, including its uncertainty.` }
  return { ...f, status: 'uncertain', explanation: `Its uncertainty spans the edge of ${RULES.massMin}–${RULES.massMax} M⊕.` }
}

function gravityFactor(planet) {
  const g = surfaceGravity(planet)
  const f = { key: 'gravity', label: 'Surface gravity', reference: null, rule: 'g = G·M/R², only from a measured true mass and a measured radius. No habitability threshold is applied.' }
  if (!g) return { ...f, status: 'unknown', inputs: [input('Mass', planet.massEarth, 'M⊕'), input('Radius', planet.radiusEarth, 'R⊕')], explanation: 'Requires a measured true mass and a measured radius (not M sin i, not an estimate, not imaging models).' }
  return { ...f, status: 'context', inputs: [input('Surface gravity', g, 'm/s²')], explanation: `About ${g.earthRatio.toPrecision(2)} × Earth's. Shown for context; no threshold is applied.` }
}

function tempFactor(planet) {
  const q = planet.eqTempK
  const f = { key: 'eqTemp', label: 'Equilibrium temperature', inputs: [input('Equilibrium temperature', q, 'K')], reference: null, rule: 'Context only: a calculated value that assumes an albedo and ignores greenhouse warming.' }
  if (!isScientific(q)) return { ...f, status: 'unknown', explanation: 'No equilibrium temperature in the catalogue.' }
  return { ...f, status: 'context', explanation: 'Context only. It assumes a reflectivity (albedo) and no greenhouse effect, so a real surface temperature can be very different.' }
}

function starFactor(planet) {
  const q = planet.star?.teff
  const spec = planet.star?.spectralType ?? null
  const f = { key: 'star', label: 'Host star', inputs: [input('Star effective temperature', q, 'K')], reference: REFS.shields, rule: `M dwarfs (spectral class M, or Teff < ${RULES.mDwarfTeffMax} K without a listed type): flare activity and likely tidal locking. Teff > ${TEFF_MAX_K} K: short-lived stars outside the model range.` }
  const t = scienceValue(q)
  const mClass = /^\s*M/i.test(spec ?? '')
  if (t == null && !spec) return { ...f, status: 'unknown', explanation: 'No stellar temperature or spectral type in the catalogue.' }
  if (mClass || (t != null && t < RULES.mDwarfTeffMax && !spec)) {
    return { ...f, status: 'uncertain', explanation: `${spec ? `Spectral type ${spec}: an` : 'A cool'} M dwarf. Planets in their habitable zones orbit close in, are likely tidally locked and are exposed to frequent flares.` }
  }
  if (t != null && t > TEFF_MAX_K) return { ...f, status: 'unfavorable', explanation: `At ${Math.round(t).toLocaleString('en-US')} K the star is hotter than the habitable-zone model covers; such stars have short main-sequence lifetimes.` }
  if (t != null && t < TEFF_MIN_K) return { ...f, status: 'uncertain', explanation: `At ${Math.round(t).toLocaleString('en-US')} K the star is cooler than the habitable-zone model covers.` }
  return { ...f, status: 'favorable', explanation: `${spec ? `Spectral type ${spec}` : 'An FGK-range temperature'}: none of the M-dwarf or hot-star caveats used here apply.` }
}

const ATMOSPHERE = {
  key: 'atmosphere',
  label: 'Atmosphere',
  status: 'unknown',
  inputs: [],
  reference: null,
  rule: 'Never assumed.',
  explanation: 'No atmospheric data in the NASA catalogue. Whether this planet has an atmosphere, and what it is made of, is unknown.',
}

export const TIERS = {
  hz_small: { label: 'Habitable-zone flux · size in the rocky range', tone: 'notable' },
  hz_mid: { label: 'Habitable-zone flux · size uncertain', tone: 'mixed' },
  hz_large: { label: 'Habitable-zone flux · likely volatile-rich size', tone: 'mixed' },
  hz_massive: { label: 'Habitable-zone flux · mass above the rocky range', tone: 'mixed' },
  hz_nosize: { label: 'Habitable-zone flux · size unknown', tone: 'mixed' },
  hot: { label: 'More starlight than the habitable zone', tone: 'outside' },
  cold: { label: 'Less starlight than the habitable zone', tone: 'outside' },
  unsupported: { label: 'Star outside the habitable-zone model', tone: 'unknown' },
  insufficient: { label: 'Insufficient data for placement', tone: 'unknown' },
}

function tier(zone, flux, size, mass) {
  if (zone.status === 'unsupported_teff' || zone.status === 'unsupported_star') return 'unsupported'
  if (flux.status === 'unknown' || (flux.status === 'uncertain' && !flux.placement)) return 'insufficient'
  if (flux.placement === 'hot' && flux.status === 'unfavorable') return 'hot'
  if (flux.placement === 'cold' && flux.status === 'unfavorable') return 'cold'
  if (size.status === 'unfavorable') return 'hz_large'
  // Size inconclusive but even the (minimum) mass is above the rocky range.
  if (mass.status === 'unfavorable' && size.status !== 'favorable') return 'hz_massive'
  if (size.status === 'unknown') return 'hz_nosize'
  if (size.status === 'favorable') return mass.status === 'unfavorable' ? 'hz_mid' : 'hz_small'
  return 'hz_mid'
}

/**
 * Contract (src/contracts/science.js): AssessHabitability.
 * @param {import('../contracts/planet.js').Planet} planet
 */
export function assessHabitability(planet) {
  const zone = evaluateZone(planet)
  const flux = fluxFactor(zone)
  const size = sizeFactor(planet)
  const mass = massFactor(planet)
  const factors = [flux, size, mass, gravityFactor(planet), tempFactor(planet), starFactor(planet), ATMOSPHERE]
  const key = tier(zone, flux, size, mass)
  const notes = [DISCLAIMER]
  if (zone.status === 'placed' && zone.flux?.status === 'calculated' && zone.flux.basis?.startsWith('S =')) notes.push('The stellar flux was calculated from the catalogue luminosity and semi-major axis.')
  if (zone.orbit) notes.push(`Measured eccentricity ${zone.orbit.eccentricity}: the flux varies along the orbit; the placement uses the catalogue flux at the semi-major axis.`)
  return { tier: { key, label: TIERS[key].label, tone: TIERS[key].tone }, factors, zone, notes }
}
