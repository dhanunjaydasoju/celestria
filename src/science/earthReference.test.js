import { describe, expect, it } from 'vitest'
import { isScientific } from '../contracts/planet.js'
import { G0 } from './derived.js'
import { EARTH_REFERENCE, REFERENCE_STATUS, earthReferenceValue } from './earthReference.js'

const values = Object.entries(EARTH_REFERENCE.values)

describe('Earth reference values', () => {
  it('are labelled as reference values, never as catalogue provenance', () => {
    expect(REFERENCE_STATUS).toBe('reference')
    for (const [key, v] of values) {
      expect(v.status, key).toBe('reference')
      expect(['measured', 'calculated', 'estimated', 'imputed', 'missing']).not.toContain(v.status)
      expect(Number.isFinite(v.value), key).toBe(true)
      expect(typeof v.unit, key).toBe('string')
      expect(v.basis.length, key).toBeGreaterThan(10)
      expect(v.source.label, key).toBeTruthy()
    }
  })

  it('cite their sources: NASA fact sheets, IAU 2015 B3, or the unit definition', () => {
    const urls = new Set(values.map(([, v]) => v.source.url))
    expect(urls).toEqual(
      new Set([
        'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html',
        'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html',
        'https://arxiv.org/abs/1510.07674',
        'https://doi.org/10.1038/ngeo941',
        null, // [Fe/H] = 0 for the Sun by definition
      ]),
    )
    expect(earthReferenceValue('star.metallicity').source.label).toBe('Definition of the unit')
  })

  it('match the sourced numbers', () => {
    const v = (k) => earthReferenceValue(k).value
    expect(v('radiusEarth')).toBe(1)
    expect(v('massEarth')).toBe(1)
    expect(v('densityGcc')).toBe(5.513) // 5,513 kg/m³
    expect(v('eqTempK')).toBe(254.0) // black-body, Bond albedo 0.294
    expect(v('insolationEarth')).toBe(1)
    expect(v('periodDays')).toBe(365.256) // sidereal
    expect(v('semiMajorAxisAU')).toBe(1)
    expect(v('eccentricity')).toBe(0.0167)
    expect(v('periastron')).toBe(0.9833)
    expect(v('apoastron')).toBe(1.0167)
    expect(v('star.teff')).toBe(5772)
    expect(v('star.massSun')).toBe(1)
    expect(v('star.radiusSun')).toBe(1)
    expect(v('star.lumLog')).toBe(0)
    expect(v('star.metallicity')).toBe(0)
    expect(v('star.ageGyr')).toBe(4.57)
  })

  it('uses the same gravity scale as planet surface gravity', () => {
    expect(earthReferenceValue('surfaceGravity').value).toBe(G0)
  })

  it('states the albedo and no-greenhouse assumption behind Earth’s equilibrium temperature', () => {
    expect(earthReferenceValue('eqTempK').basis).toMatch(/albedo 0\.294/)
    expect(earthReferenceValue('eqTempK').basis).toMatch(/no greenhouse/)
  })

  it('has no counterpart for sky-plane inclination or distance from Earth', () => {
    expect(earthReferenceValue('inclinationDeg')).toBeNull()
    expect(earthReferenceValue('distancePc')).toBeNull()
    expect(earthReferenceValue('nope')).toBeNull()
  })

  it('cannot be modified', () => {
    expect(Object.isFrozen(EARTH_REFERENCE.values)).toBe(true)
    expect(Object.isFrozen(EARTH_REFERENCE.values.radiusEarth)).toBe(true)
  })

  it('is distinguishable from catalogue data by status', () => {
    // isScientific only checks for missing/imputed; callers must check
    // status === 'reference' (compare.js never ranks reference cells).
    expect(isScientific(earthReferenceValue('radiusEarth'))).toBe(true)
    expect(earthReferenceValue('radiusEarth').status).not.toBe('measured')
  })
})
