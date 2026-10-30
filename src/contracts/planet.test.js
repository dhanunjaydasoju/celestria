import { describe, expect, it } from 'vitest'
import { PROVENANCE, isKnown, isScientific, missing, planetSlug, quantity, scienceValue } from './planet.js'

describe('Quantity helpers', () => {
  it('treats null, NaN and Infinity as missing', () => {
    expect(quantity(null, PROVENANCE.MEASURED)).toEqual(missing())
    expect(quantity(NaN, PROVENANCE.MEASURED).status).toBe(PROVENANCE.MISSING)
    expect(quantity(Infinity, PROVENANCE.MEASURED).value).toBeNull()
  })

  it('keeps imputed values out of science', () => {
    const imputed = quantity(1.2, PROVENANCE.IMPUTED)
    expect(isKnown(imputed)).toBe(true)
    expect(isScientific(imputed)).toBe(false)
    expect(scienceValue(imputed)).toBeNull()
  })

  it('passes measured, calculated and estimated values through', () => {
    for (const status of [PROVENANCE.MEASURED, PROVENANCE.CALCULATED, PROVENANCE.ESTIMATED]) {
      expect(scienceValue(quantity(3, status))).toBe(3)
    }
  })
})

describe('planetSlug', () => {
  it('builds URL-safe ids', () => {
    expect(planetSlug('TRAPPIST-1 e')).toBe('trappist-1-e')
    expect(planetSlug('Kepler-1649 c')).toBe('kepler-1649-c')
    expect(planetSlug('HD 209458 b')).toBe('hd-209458-b')
    expect(planetSlug('  2MASS J1207+3932 b ')).toBe('2mass-j1207-3932-b')
  })
})
