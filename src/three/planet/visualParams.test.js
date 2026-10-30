import { describe, expect, it } from 'vitest'
import { labPlanets } from '../lab/fixtures.js'
import { blackbodyRGB } from '../star/starColor.js'
import { classifySize, classifyThermal, thermalBand } from './archetype.js'
import { hashSeed, visualParams } from './visualParams.js'

const byId = Object.fromEntries(labPlanets.map((p) => [p.id, p]))
const q = (value, status = 'measured', extra) => ({ value, status, ...extra })

describe('classifySize', () => {
  it('uses radius first', () => {
    expect(classifySize({ radiusEarth: q(1), massEarth: q(300) }).type).toBe('rocky')
    expect(classifySize({ radiusEarth: q(2.7) }).type).toBe('subNeptune')
    expect(classifySize({ radiusEarth: q(4.2) }).type).toBe('neptune')
    expect(classifySize({ radiusEarth: q(11) }).type).toBe('giant')
  })

  it('falls back to mass and notes a minimum mass', () => {
    const r = classifySize({ radiusEarth: q(null, 'missing'), massEarth: q(1.07, 'measured', { kind: 'Msini' }) })
    expect(r.type).toBe('rocky')
    expect(r.sizeBasis.note).toBe('minimum mass')
  })

  it('ignores imputed values', () => {
    expect(classifySize({ radiusEarth: q(1, 'imputed'), massEarth: q(null, 'missing') }).type).toBe('unclassified')
  })
})

describe('classifyThermal', () => {
  it('bands by equilibrium temperature', () => {
    expect(thermalBand(2000)).toBe('scorching')
    expect(thermalBand(700)).toBe('hot')
    expect(thermalBand(400)).toBe('warm')
    expect(thermalBand(255)).toBe('temperate')
    expect(thermalBand(120)).toBe('cold')
    expect(thermalBand(null)).toBe('unknown')
  })

  it('derives temperature from insolation when Teq is missing', () => {
    const r = classifyThermal({ eqTempK: q(null, 'missing'), insolationEarth: q(1) })
    expect(r.temperatureK).toBeCloseTo(278.6, 0)
    expect(r.thermalBasis.field).toBe('insolationEarth')
  })
})

describe('visualParams on real NASA fixtures', () => {
  it('assigns the expected archetypes', () => {
    const expected = {
      'trappist-1-e': ['rocky', 'temperate'],
      '55-cnc-e': ['subNeptune', 'scorching'], // 1.88 R⊕ sits above the 1.6 R⊕ boundary
      'kepler-10-b': ['rocky', 'scorching'],
      'gj-1214-b': ['subNeptune', 'hot'],
      'gj-436-b': ['neptune', 'hot'],
      'hd-209458-b': ['giant', 'scorching'],
      'kepler-167-e': ['giant', 'cold'],
    }
    for (const [id, [type, band]] of Object.entries(expected)) {
      const v = visualParams(byId[id])
      expect([id, v.archetype, v.thermal]).toEqual([id, type, band])
    }
  })

  it('is deterministic per planet', () => {
    expect(visualParams(byId['trappist-1-e'])).toEqual(visualParams(byId['trappist-1-e']))
    expect(hashSeed('TRAPPIST-1 e')).not.toBe(hashSeed('TRAPPIST-1 f'))
  })

  it('never gives rocky worlds an atmosphere shell', () => {
    for (const p of labPlanets) {
      const v = visualParams(p)
      if (v.archetype === 'rocky') expect(v.atmosphere).toBeNull()
    }
  })
})

describe('visualParams with missing data', () => {
  it('renders an all-missing planet as unclassified with flagged imputations', () => {
    const v = visualParams(byId['test-all-missing'])
    expect(v.archetype).toBe('unclassified')
    expect(v.thermal).toBe('unknown')
    expect(v.coverage).toMatchObject({ available: 0, total: 5 })
    expect(v.imputed).toEqual(expect.arrayContaining(['displayRadius', 'starLight']))
    expect(v.displayRadius.status).toBe('imputed')
    expect(v.surface.glow).toBe(0)
  })

  it('survives a planet object with no fields at all', () => {
    expect(() => visualParams({ id: 'x', name: 'x' })).not.toThrow()
  })
})

describe('blackbodyRGB', () => {
  it('runs red for cool stars and blue-white for hot ones', () => {
    const cool = blackbodyRGB(2566)
    const hot = blackbodyRGB(10000)
    expect(cool[0]).toBeGreaterThan(cool[2])
    expect(hot[2]).toBeGreaterThanOrEqual(hot[0])
    expect(blackbodyRGB(null)).toBeNull()
  })
})
