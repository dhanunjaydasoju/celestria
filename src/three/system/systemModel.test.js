import { describe, expect, it } from 'vitest'
import { labTestSystemPlanets } from '../lab/testSystems.js'
import { labPlanets } from '../lab/fixtures.js'
import { buildSystemModel, keplerSemiMajorAxisAU, orbitAngle, resolveDistance } from './systemModel.js'

const trappist = labPlanets.filter((p) => p.host === 'TRAPPIST-1')

describe('keplerSemiMajorAxisAU', () => {
  it('gives 1 AU for a 1-year orbit around 1 solar mass', () => {
    expect(keplerSemiMajorAxisAU(365.25, 1)).toBeCloseTo(1, 6)
  })

  it('matches the catalog for TRAPPIST-1 e within a few percent', () => {
    const e = trappist.find((p) => p.name === 'TRAPPIST-1 e')
    const a = keplerSemiMajorAxisAU(e.periodDays.value, e.star.massSun.value)
    expect(Math.abs(a - e.semiMajorAxisAU.value) / e.semiMajorAxisAU.value).toBeLessThan(0.05)
  })

  it('refuses to compute without both period and stellar mass', () => {
    expect(keplerSemiMajorAxisAU(10, null)).toBeNull()
    expect(keplerSemiMajorAxisAU(null, 1)).toBeNull()
  })
})

describe('resolveDistance', () => {
  it('labels catalog, Kepler and arbitrary distances separately', () => {
    const [cat, kep, arb] = labTestSystemPlanets
    expect(resolveDistance(cat, 0.7)).toMatchObject({ source: 'catalog', status: 'measured', aAU: 0.05 })
    expect(resolveDistance(kep, 0.7)).toMatchObject({ source: 'kepler', status: 'calculated' })
    expect(resolveDistance(arb, 0.7)).toMatchObject({ source: 'arbitrary', aAU: null })
  })

  it('does not use Kepler without a stellar mass', () => {
    expect(resolveDistance(labTestSystemPlanets[1], null).source).toBe('arbitrary')
  })
})

describe('buildSystemModel', () => {
  it('orders TRAPPIST-1 b → h by distance and uses catalog values', () => {
    const m = buildSystemModel(trappist)
    expect(m.planets.map((p) => p.planet.name)).toEqual([
      'TRAPPIST-1 b', 'TRAPPIST-1 c', 'TRAPPIST-1 d', 'TRAPPIST-1 e',
      'TRAPPIST-1 f', 'TRAPPIST-1 g', 'TRAPPIST-1 h',
    ])
    expect([...m.sources]).toEqual(['catalog'])
    expect(m.star.imputed).toEqual([])
  })

  it('keeps faster planets faster on screen', () => {
    const m = buildSystemModel(trappist)
    const secs = m.planets.map((p) => p.orbitSeconds)
    expect(secs[0]).toBeCloseTo(9)
    for (let i = 1; i < secs.length; i++) expect(secs[i]).toBeGreaterThan(secs[i - 1])
  })

  it('handles the synthetic mixed system and flags the missing star radius', () => {
    const m = buildSystemModel(labTestSystemPlanets)
    expect(m.sources).toEqual(new Set(['catalog', 'kepler', 'arbitrary']))
    expect(m.planets.at(-1).distance.source).toBe('arbitrary')
    expect(m.star.imputed).toContain('radius')
  })

  it('survives a planet with nothing but a name', () => {
    const m = buildSystemModel([{ id: 'x', name: 'x', host: 'x' }])
    expect(m.planets[0].distance.source).toBe('arbitrary')
    expect(orbitAngle(m.planets[0], 100)).toBe(m.planets[0].phase0)
  })
})
