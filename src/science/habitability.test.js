import { describe, expect, it } from 'vitest'
import { missing, quantity } from '../contracts/planet.js'
import { assessHabitability, evaluateZone, luminosityClass, planetFlux, RULES } from './habitability.js'
import { COEFFICIENTS, habitableZone, habitableZoneFlux, placementForFlux, seff, TEFF_MAX_K, TEFF_MIN_K } from './habitableZone.js'

const m = (value, err, extra = {}) => quantity(value, 'measured', { err, source: { label: 'Doe et al. 2020', url: 'https://x' }, ...extra })
const EMPTY = ['radiusEarth', 'massEarth', 'densityGcc', 'eqTempK', 'insolationEarth', 'periodDays', 'semiMajorAxisAU', 'eccentricity', 'inclinationDeg', 'periastronArgDeg', 'periastronTimeJD', 'transitMidJD']

/** A planet with only the given fields; everything else missing. */
function planet(fields = {}, star = {}) {
  return {
    id: 'p', name: 'P b', host: 'P',
    ...Object.fromEntries(EMPTY.map((k) => [k, missing()])),
    ...fields,
    star: { name: 'P', spectralType: null, teff: missing(), radiusSun: missing(), massSun: missing(), lumLog: missing(), metallicity: missing(), ageGyr: missing(), ...star },
    discovery: { method: 'Transit', year: 2020 },
    system: { distancePc: missing() },
    flags: { controversial: false },
  }
}
const factor = (a, key) => a.factors.find((f) => f.key === key)

describe('habitableZone (Kopparapu et al. 2014)', () => {
  it('reproduces the published solar values', () => {
    expect(habitableZoneFlux(5780)).toEqual({ recentVenus: 1.776, runawayGreenhouse: 1.107, maximumGreenhouse: 0.356, earlyMars: 0.32 })
    const au = habitableZone(5780, 0)
    expect(au.conservative[0]).toBeCloseTo(0.950, 3) // runaway greenhouse, 1 M⊕
    expect(au.conservative[1]).toBeCloseTo(1.676, 3) // maximum greenhouse
    expect(au.optimistic[0]).toBeCloseTo(0.750, 3) // Recent Venus
    expect(au.optimistic[1]).toBeCloseTo(1.768, 3) // Early Mars
  })

  it('keeps the boundaries ordered across the valid temperature range', () => {
    for (let t = TEFF_MIN_K; t <= TEFF_MAX_K; t += 100) {
      const s = habitableZoneFlux(t)
      expect(s.recentVenus).toBeGreaterThan(s.runawayGreenhouse)
      expect(s.runawayGreenhouse).toBeGreaterThan(s.maximumGreenhouse)
      expect(s.maximumGreenhouse).toBeGreaterThan(s.earlyMars)
    }
    expect(seff('runawayGreenhouse', 3000)).toBeLessThan(seff('runawayGreenhouse', 6000)) // cooler stars: zone at lower flux
  })

  it('refuses unsupported or missing stellar temperatures and luminosities', () => {
    expect(seff('earlyMars', TEFF_MIN_K - 1)).toBeNull()
    expect(seff('earlyMars', TEFF_MAX_K + 1)).toBeNull()
    expect(habitableZoneFlux(NaN)).toBeNull()
    expect(habitableZone(5780, null)).toBeNull()
    expect(habitableZoneFlux(TEFF_MIN_K)).not.toBeNull() // edges are inside the range
    expect(habitableZoneFlux(TEFF_MAX_K)).not.toBeNull()
  })

  it('places fluxes with edges belonging to the zone they bound', () => {
    const s = habitableZoneFlux(5780)
    expect(placementForFlux(s.runawayGreenhouse, s)).toBe('conservative')
    expect(placementForFlux(s.maximumGreenhouse, s)).toBe('conservative')
    expect(placementForFlux(s.runawayGreenhouse + 1e-9, s)).toBe('optimistic_inner')
    expect(placementForFlux(s.recentVenus, s)).toBe('optimistic_inner')
    expect(placementForFlux(s.recentVenus + 1e-9, s)).toBe('hot')
    expect(placementForFlux(s.earlyMars, s)).toBe('optimistic_outer')
    expect(placementForFlux(s.earlyMars - 1e-9, s)).toBe('cold')
    expect(placementForFlux(1, s)).toBe('conservative') // Earth
    expect(Object.keys(COEFFICIENTS)).toHaveLength(6)
  })
})

describe('planetFlux', () => {
  it('uses the catalogue insolation, else calculates it from luminosity and orbit with propagated uncertainty', () => {
    expect(planetFlux(planet({ insolationEarth: m(0.9, [0.1, -0.1]) }))).toMatchObject({ value: 0.9, status: 'measured', basis: 'NASA catalogue insolation' })
    const calc = planetFlux(planet({ semiMajorAxisAU: m(0.5, [0.01, -0.01]) }, { lumLog: m(-0.5, [0.02, -0.02]) }))
    expect(calc.status).toBe('calculated')
    expect(calc.value).toBeCloseTo(10 ** -0.5 / 0.25, 9)
    expect(calc.err[0] / calc.value).toBeCloseTo(Math.hypot(Math.LN10 * 0.02, 0.04), 9)
    expect(planetFlux(planet({ semiMajorAxisAU: m(0.5) }))).toBeNull()
  })

  it('never uses an imputed value', () => {
    expect(planetFlux(planet({ insolationEarth: quantity(1, 'imputed') }))).toBeNull()
    const a = assessHabitability(planet({ insolationEarth: quantity(1, 'imputed'), radiusEarth: quantity(1, 'imputed') }, { teff: quantity(5700, 'imputed') }))
    expect(a.zone.status).toBe('no_teff')
    expect(factor(a, 'size').status).toBe('unknown')
    expect(JSON.stringify(a)).not.toContain('"imputed"')
  })
})

describe('evaluateZone', () => {
  const sun = { teff: m(5780, [50, -50]) }
  it('marks placements that straddle a boundary within the flux or temperature uncertainty', () => {
    const s = habitableZoneFlux(5780)
    const firm = evaluateZone(planet({ insolationEarth: m(0.7, [0.05, -0.05]) }, sun))
    expect(firm).toMatchObject({ status: 'placed', placement: 'conservative', straddles: false })
    const edge = evaluateZone(planet({ insolationEarth: m(s.runawayGreenhouse - 0.01, [0.05, -0.05]) }, sun))
    expect(edge).toMatchObject({ placement: 'conservative', straddles: true, placementsWithinUncertainty: ['optimistic_inner', 'conservative'] })
    // No flux uncertainty, but the star's temperature uncertainty moves the boundary across the planet.
    const teffEdge = evaluateZone(planet({ insolationEarth: m(s.runawayGreenhouse - 0.001) }, { teff: m(5780, [400, -400]) }))
    expect(teffEdge.straddles).toBe(true)
  })

  it('explains why a planet cannot be placed', () => {
    expect(evaluateZone(planet({ insolationEarth: m(1) })).status).toBe('no_teff')
    expect(evaluateZone(planet({}, sun)).status).toBe('no_flux')
    expect(evaluateZone(planet({ insolationEarth: m(1) }, { teff: m(2566) }))).toMatchObject({ status: 'unsupported_teff', reason: expect.stringMatching(/2,600–7,200 K/) })
    expect(evaluateZone(planet({ insolationEarth: m(1) }, { teff: m(9000) })).status).toBe('unsupported_teff')
    expect(evaluateZone(planet({ insolationEarth: m(1) }, { teff: m(4800), spectralType: 'G8 III' }))).toMatchObject({ status: 'unsupported_star', reason: expect.stringMatching(/evolved star/) })
  })

  it('handles flux limits and eccentric orbits', () => {
    expect(evaluateZone(planet({ insolationEarth: m(0.1, undefined, { limit: '<' }) }, sun))).toMatchObject({ status: 'limit', placement: 'cold' })
    expect(evaluateZone(planet({ insolationEarth: m(1, undefined, { limit: '<' }) }, sun))).toMatchObject({ status: 'limit', placement: null, straddles: true })
    const ecc = evaluateZone(planet({ insolationEarth: m(1, [0.01, -0.01]), eccentricity: m(0.5, [0.02, -0.02]) }, sun))
    expect(ecc.orbit).toMatchObject({ crossesBoundary: true })
    expect(ecc.orbit.periastronFlux).toBeCloseTo(4, 9)
  })

  it('reads luminosity classes from spectral types', () => {
    expect(['G8 III', 'K2 V', 'F5 IV-V', 'M5.5/M6', 'K1III', 'G2'].map(luminosityClass)).toEqual(['III', 'V', 'IV', null, 'III', null])
  })
})

describe('assessHabitability', () => {
  it('returns individual indicators with inputs, rules and explanations, and never a score', () => {
    const a = assessHabitability(planet({ insolationEarth: m(0.8, [0.05, -0.05]), radiusEarth: m(1.1, [0.05, -0.05]), massEarth: m(1.2, [0.2, -0.2], { kind: 'Mass' }), eqTempK: m(260, [5, -5]) }, { teff: m(5600, [50, -50]), spectralType: 'G5 V' }))
    expect(a.factors.map((f) => f.key)).toEqual(['flux', 'size', 'mass', 'gravity', 'eqTemp', 'star', 'atmosphere'])
    expect(a.factors.map((f) => f.status)).toEqual(['favorable', 'favorable', 'favorable', 'context', 'context', 'favorable', 'unknown'])
    expect(a.tier.key).toBe('hz_small')
    for (const f of a.factors) {
      expect(f.explanation.length).toBeGreaterThan(20)
      expect(f.rule).toBeTruthy()
    }
    expect(factor(a, 'size').inputs[0].quantity).toMatchObject({ value: 1.1, err: [0.05, -0.05], source: { label: 'Doe et al. 2020' } })
    const text = JSON.stringify(a)
    expect(text).not.toMatch(/%|percent|probability|score/i)
    expect(text).not.toMatch(/\b(is|are) habitable\b|supports? life|has life/i)
    expect(a.notes[0]).toMatch(/not evidence of habitability or life/)
  })

  it('always reports the atmosphere as unknown', () => {
    for (const p of [planet(), planet({ insolationEarth: m(1), radiusEarth: m(1) }, { teff: m(5780) })]) {
      expect(factor(assessHabitability(p), 'atmosphere')).toMatchObject({ status: 'unknown', explanation: expect.stringMatching(/No atmospheric data/) })
    }
  })

  it('reports insufficient data for a planet with nothing measured', () => {
    const a = assessHabitability(planet())
    expect(a.tier.key).toBe('insufficient')
    expect(a.factors.filter((f) => f.status === 'unknown').map((f) => f.key)).toEqual(['flux', 'size', 'mass', 'gravity', 'eqTemp', 'star', 'atmosphere'])
  })

  it('treats size thresholds and their uncertainty correctly', () => {
    const at = (r, err, status = 'measured') => factor(assessHabitability(planet({ radiusEarth: quantity(r, status, err ? { err } : {}) })), 'size').status
    expect(at(RULES.rockyRadiusMax)).toBe('favorable') // the threshold itself is inside
    expect(at(1.62)).toBe('uncertain')
    expect(at(1.5, [0.2, -0.2])).toBe('uncertain') // spans 1.6
    expect(at(3)).toBe('unfavorable')
    expect(at(1.0, undefined, 'calculated')).toBe('uncertain') // NASA-calculated radius is not a measurement
  })

  it('never treats minimum or estimated masses as measurements', () => {
    const mass = (q) => factor(assessHabitability(planet({ massEarth: q })), 'mass')
    expect(mass(m(1.0, [0.1, -0.1], { kind: 'Msini' })).status).toBe('uncertain')
    expect(mass(m(12, [1, -1], { kind: 'Msini' }))).toMatchObject({ status: 'unfavorable', explanation: expect.stringMatching(/Even the minimum mass/) })
    expect(mass(quantity(3, 'estimated', { kind: 'M-R' })).status).toBe('uncertain')
    expect(mass(m(9.5, [1, -1], { kind: 'Mass' })).status).toBe('uncertain') // spans 10
    expect(mass(m(300, [10, -10], { kind: 'Mass' })).status).toBe('unfavorable')
    expect(mass(m(0.05, [0.01, -0.01], { kind: 'Mass' })).status).toBe('unfavorable')
  })

  it('classifies stars without overclaiming', () => {
    const star = (s) => factor(assessHabitability(planet({}, s)), 'star')
    expect(star({ teff: m(3200), spectralType: 'M4 V' }).status).toBe('uncertain')
    expect(star({ teff: m(3500) }).status).toBe('uncertain') // cool, no type listed
    expect(star({ teff: m(7600) }).status).toBe('unfavorable')
    expect(star({ teff: m(5800), spectralType: 'G2 V' }).status).toBe('favorable')
  })

  it('assigns summary tiers that describe indicators, not habitability', () => {
    const tierOf = (flux, r, teff = 5780) => assessHabitability(planet({ insolationEarth: m(flux, [0.01, -0.01]), ...(r ? { radiusEarth: m(r, [0.01, -0.01]) } : {}) }, { teff: m(teff, [10, -10]) })).tier
    expect(tierOf(0.8, 1.0).key).toBe('hz_small')
    expect(tierOf(0.8, 2.0).key).toBe('hz_mid')
    expect(tierOf(0.8, 11).key).toBe('hz_large')
    expect(tierOf(0.8, null).key).toBe('hz_nosize')
    // Size inconclusive (NASA-calculated radius) but even the minimum mass is far above 10 M⊕.
    const massive = assessHabitability(planet({ insolationEarth: m(0.8, [0.01, -0.01]), radiusEarth: quantity(13, 'calculated'), massEarth: m(900, [50, -50], { kind: 'Msini' }) }, { teff: m(5780, [10, -10]) }))
    expect(massive.tier).toMatchObject({ key: 'hz_massive', label: 'Habitable-zone flux · mass above the rocky range' })
    expect(tierOf(50, 1.0).key).toBe('hot')
    expect(tierOf(0.05, 1.0).key).toBe('cold')
    expect(tierOf(0.8, 1.0, 2000).key).toBe('unsupported')
    expect(tierOf(0.8, 1.0).label).not.toMatch(/habitable planet|Earth-like|life/i)
  })
})
