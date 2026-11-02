import { describe, expect, it } from 'vitest'
import { EARTH_RADIUS_KM, SUN_RADIUS_KM, earthReferenceValue } from './earthReference.js'
import { R_SUN_KM } from './kepler.js'
import {
  SUNFALL_CONSTANTS,
  SUNFALL_WORDING,
  SUN_RADIUS_EARTH,
  countText,
  sunfallFromCell,
  sunfallHeadline,
  sunfallResult,
  volumeRatio,
} from './sunfall.js'

const MISSING = { value: null, status: 'missing' }
const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })
const planet = (radiusEarth, extra = {}) => ({
  id: 'p',
  name: 'P',
  host: 'H',
  radiusEarth,
  massEarth: MISSING,
  star: {},
  system: {},
  discovery: { method: 'Transit' },
  ...extra,
})
const K = 695700 / 6371

describe('constants', () => {
  it('uses the same solar and Earth radii as the rest of the app', () => {
    expect(SUN_RADIUS_KM).toBe(695700)
    expect(SUN_RADIUS_KM).toBe(R_SUN_KM) // kepler.js
    expect(EARTH_RADIUS_KM).toBe(6371.0)
    expect(earthReferenceValue('star.radiusSun').basis).toContain('695,700 km')
    expect(earthReferenceValue('radiusEarth').basis).toContain('6,371.000 km')
    expect(SUN_RADIUS_EARTH).toBeCloseTo(109.198, 3)
    expect(SUNFALL_CONSTANTS).toMatchObject({ sunRadiusKm: 695700, earthRadiusKm: 6371, formula: 'N = (R☉ / R)³' })
    expect(Object.isFrozen(SUNFALL_CONSTANTS)).toBe(true)
  })
})

describe('volumeRatio', () => {
  it('is (R☉/R)³', () => {
    expect(volumeRatio(1)).toBeCloseTo(K ** 3, 6)
    expect(volumeRatio(1)).toBeCloseTo(1302096.57, 1)
    expect(volumeRatio(11.209)).toBeCloseTo(924.576, 3)
    expect(volumeRatio(SUN_RADIUS_EARTH)).toBeCloseTo(1, 12) // the Sun itself
    expect(volumeRatio(2 * SUN_RADIUS_EARTH)).toBeCloseTo(0.125, 12) // larger than the Sun
  })

  it('scales with the inverse cube of the radius', () => {
    expect(volumeRatio(1) / volumeRatio(2)).toBeCloseTo(8, 10)
    expect(volumeRatio(0.5) / volumeRatio(1)).toBeCloseTo(8, 10)
  })

  it('rejects non-positive, non-finite and non-numeric radii', () => {
    for (const r of [0, -1, NaN, Infinity, -Infinity, null, undefined, '1', {}]) expect(volumeRatio(r)).toBeNull()
  })
})

describe('countText', () => {
  it('uses words from a million and shows digits down to 10^e', () => {
    expect(countText(1302000, 3)).toBe('1.302 million')
    expect(countText(48200000, 5)).toBe('48.2 million')
    expect(countText(1.3e9, 8)).toBe('1.3 billion')
    expect(countText(163000, 3)).toBe('163,000')
    expect(countText(925, 0)).toBe('925')
    expect(countText(0.52, -2)).toBe('0.52')
  })
})

describe('sunfallResult: values', () => {
  it('Earth-sized measured radius with uncertainty: exact propagation through the cube', () => {
    const r = sunfallResult(planet(q(1, 'measured', { err: [0.01, -0.01] })))
    expect(r).toMatchObject({ status: 'value', relation: '=', uncertaintyKnown: true, radiusProvenance: 'measured', reason: null })
    expect(r.ratio).toBeCloseTo(1302096.57, 1)
    expect(r.range[0]).toBeCloseTo((K / 1.01) ** 3, 4) // larger radius → fewer volumes
    expect(r.range[1]).toBeCloseTo((K / 0.99) ** 3, 4)
    expect(r.display).toEqual({ value: '1.302 million', low: '1.263 million', high: '1.342 million', exponent: 3 })
    expect(r.animation).toEqual({ animate: true, target: r.ratio })
  })

  it('handles asymmetric uncertainty: each side maps to the opposite end of N', () => {
    const r = sunfallResult(planet(q(2, 'measured', { err: [0.5, -0.2] })))
    expect(r.range[0]).toBeCloseTo((K / 2.5) ** 3, 4) // from R + σ₊
    expect(r.range[1]).toBeCloseTo((K / 1.8) ** 3, 4) // from R − σ₋
    expect(r.ratio - r.range[0]).toBeGreaterThan(r.range[1] - r.ratio) // asymmetric in N too
    expect(r.display).toEqual({ value: '163,000', low: '83,000', high: '224,000', exponent: 3 })
  })

  it('rounds the range outward so it never claims more precision than it has', () => {
    const r = sunfallResult(planet(q(0.92, 'measured', { err: [0.013, -0.012] })))
    expect(r.display).toEqual({ value: '1.672 million', low: '1.603 million', high: '1.740 million', exponent: 3 })
  })

  it('leaves the upper end open when the lower radius bound reaches zero', () => {
    const r = sunfallResult(planet(q(0.5, 'measured', { err: [0.1, -0.6] })))
    expect(r.range[1]).toBeNull()
    expect(r.display.high).toBeNull()
    expect(r.range[0]).toBeCloseTo((K / 0.6) ** 3, 3)
  })

  it('gas giant: hundreds of volumes', () => {
    const r = sunfallResult(planet(q(11.209)))
    expect(r.ratio).toBeCloseTo(924.576, 3)
    expect(r.display.value).toBe('925')
    expect(r.uncertaintyKnown).toBe(false)
    expect(r.notes[0]).toMatch(/No uncertainty is reported/)
    const big = sunfallResult(planet(q(22)))
    expect(big.display.value).toBe('122')
  })

  it('sub-Earth: tens of millions of volumes', () => {
    const r = sunfallResult(planet(q(0.3)))
    expect(r.ratio).toBeCloseTo(48225798.88, 1)
    expect(r.display.value).toBe('48.2 million')
  })

  it('a planet larger than the Sun gives a fraction, not a crash', () => {
    const r = sunfallResult(planet(q(2 * SUN_RADIUS_EARTH)))
    expect(r.status).toBe('value')
    expect(r.ratio).toBeCloseTo(0.125, 10)
    expect(r.display.value).toBe('0.125')
  })
})

describe('sunfallResult: provenance', () => {
  it('keeps measured, NASA-calculated and estimated radii distinct', () => {
    expect(sunfallResult(planet(q(1.3))).radiusProvenance).toBe('measured')
    const calc = sunfallResult(planet(q(1.02, 'calculated')))
    expect(calc.radiusProvenance).toBe('calculated')
    expect(calc.notes[1]).toMatch(/calculated by NASA .* not a direct measurement/)
    const est = sunfallResult(planet(q(2.1, 'estimated')))
    expect(est.radiusProvenance).toBe('estimated')
    expect(est.notes.join(' ')).toMatch(/model-based radius estimate/)
  })

  it('treats directly imaged planets’ radii as model-based estimates', () => {
    const r = sunfallResult(planet(q(13, 'measured', { err: [1, -1] }), { discovery: { method: 'Imaging' } }))
    expect(r.radiusProvenance).toBe('estimated')
    expect(r.radius.modelBased).toBe(true)
    expect(r.notes[0]).toMatch(/evolutionary models/)
  })

  it('is independent of the mass and its kind', () => {
    const base = sunfallResult(planet(q(1.3, 'measured', { err: [0.1, -0.1] })))
    const withMin = sunfallResult(planet(q(1.3, 'measured', { err: [0.1, -0.1] }), { massEarth: q(5, 'measured', { kind: 'Msini' }) }))
    const withMR = sunfallResult(planet(q(1.3, 'measured', { err: [0.1, -0.1] }), { massEarth: q(5, 'estimated', { kind: 'M-R' }) }))
    expect(withMin.ratio).toBe(base.ratio)
    expect(withMin.radiusProvenance).toBe('measured')
    expect(withMR.display).toEqual(base.display)
  })

  it('keeps the radius uncertainty and source with the result', () => {
    const src = { label: 'Agol et al. 2021', url: 'https://example.org' }
    const r = sunfallResult(planet(q(0.92, 'measured', { err: [0.013, -0.012], source: src })))
    expect(r.radius).toMatchObject({ value: 0.92, err: [0.013, -0.012], source: src, kind: 'measured' })
  })

  it('always states the volume-equivalence, packing and Sun caveats', () => {
    const r = sunfallResult(planet(q(1)))
    expect(r.notes).toEqual(expect.arrayContaining([SUNFALL_WORDING.equivalence, SUNFALL_WORDING.packing, SUNFALL_WORDING.sun]))
    expect(SUNFALL_WORDING.packing).toMatch(/not a packing count/)
    expect(SUNFALL_WORDING.packing).toMatch(/cannot fill a larger sphere without gaps/)
    expect(SUNFALL_WORDING.sun).toMatch(/not the planet’s host star/)
  })
})

describe('sunfallResult: limits', () => {
  it('an upper radius limit gives a lower bound on N, rounded down', () => {
    const r = sunfallResult(planet(q(2, 'measured', { limit: '<' })))
    expect(r).toMatchObject({ status: 'lowerBound', relation: '>', range: null, uncertaintyKnown: false })
    expect(r.ratio).toBeCloseTo((K / 2) ** 3, 4) // 162,762
    expect(r.display.value).toBe('160,000') // ≤ the true bound, so "more than" stays true
    expect(r.animation.target).toBe(160000)
    expect(r.notes[0]).toMatch(/upper limit .* at least/)
    expect(sunfallHeadline({ ...r, planetName: 'P' })).toBe('The Sun’s volume is more than 160,000 times the volume of P.')
  })

  it('a lower radius limit gives an upper bound on N, rounded up', () => {
    const r = sunfallResult(planet(q(2, 'measured', { limit: '>' })))
    expect(r).toMatchObject({ status: 'upperBound', relation: '<' })
    expect(r.display.value).toBe('170,000') // ≥ the true bound, so "less than" stays true
    expect(r.notes[0]).toMatch(/lower limit .* at most/)
    expect(sunfallHeadline({ ...r, planetName: 'P' })).toBe('The Sun’s volume is less than 170,000 times the volume of P.')
  })

  it('never rounds a bound across a power of ten in the wrong direction', () => {
    const up = sunfallResult(planet(q(K / 10 ** (1 / 3) / 1.0001, 'measured', { limit: '<' }))) // N just above 1000
    expect(Number(up.display.value.replace(/,/g, ''))).toBeLessThanOrEqual(up.ratio)
    const down = sunfallResult(planet(q(K / 10 ** (1 / 3) * 1.0001, 'measured', { limit: '>' }))) // N just below 1000
    expect(Number(down.display.value.replace(/,/g, ''))).toBeGreaterThanOrEqual(down.ratio)
  })
})

describe('sunfallResult: no number without a usable radius', () => {
  it('missing radius', () => {
    const r = sunfallResult(planet(MISSING))
    expect(r).toMatchObject({ status: 'unavailable', ratio: null, range: null, display: null, relation: null, radiusProvenance: null })
    expect(r.reason).toMatch(/Not available/)
    expect(r.animation).toEqual({ animate: false, target: null })
    expect(sunfallHeadline({ ...r, planetName: 'P' })).toBeNull()
  })

  it('imputed radius is never used', () => {
    const r = sunfallResult(planet(q(2.2, 'imputed')))
    expect(r.status).toBe('unavailable')
    expect(r.ratio).toBeNull()
  })

  it('absent radius field', () => {
    const p = planet(MISSING)
    delete p.radiusEarth
    expect(sunfallResult(p).status).toBe('unavailable')
  })

  it('zero, negative and non-finite radii', () => {
    for (const v of [0, -1.5, Infinity, NaN]) {
      const r = sunfallResult(planet(q(v)))
      expect(r.status, String(v)).toBe('unavailable')
      expect(r.ratio, String(v)).toBeNull()
    }
    expect(sunfallResult(planet(q(-1))).reason).toMatch(/not a positive number/)
  })

  it('a missing cell passed directly', () => {
    expect(sunfallFromCell(null).status).toBe('unavailable')
  })
})

describe('determinism', () => {
  it('returns identical results and does not modify the planet', () => {
    const p = planet(q(0.92, 'measured', { err: [0.013, -0.012] }))
    const copy = structuredClone(p)
    expect(sunfallResult(p)).toEqual(sunfallResult(p))
    expect(p).toEqual(copy)
  })
})
