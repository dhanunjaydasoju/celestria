import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { missing, quantity } from '../../contracts/planet.js'
import HabitabilityPanel from './HabitabilityPanel.jsx'
import { bandPolygon, fluxScale, fluxTicks, sizeClassOf, withErr } from './hzChart.js'

const m = (value, err, extra = {}) => quantity(value, 'measured', { err, source: { label: 'Doe et al. 2020', url: 'https://ads/doe' }, ...extra })
const EMPTY = ['radiusEarth', 'massEarth', 'densityGcc', 'eqTempK', 'insolationEarth', 'periodDays', 'semiMajorAxisAU', 'eccentricity', 'inclinationDeg', 'periastronArgDeg', 'periastronTimeJD', 'transitMidJD']
const planet = (fields, star) => ({
  id: 'p-b', name: 'P b', host: 'P',
  ...Object.fromEntries(EMPTY.map((k) => [k, missing()])),
  ...fields,
  star: { name: 'P', spectralType: 'G2 V', teff: m(5780, [20, -20]), radiusSun: missing(), massSun: missing(), lumLog: missing(), metallicity: missing(), ageGyr: missing(), ...star },
  discovery: { method: 'Transit' },
  system: { distancePc: missing() },
  flags: {},
})
const render = (p) => renderToStaticMarkup(<MemoryRouter><HabitabilityPanel planet={p} /></MemoryRouter>)
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

describe('HabitabilityPanel', () => {
  it('shows the tier, the disclaimer, the zone strip and every indicator with status words', () => {
    const html = render(planet({ insolationEarth: m(0.8, [0.05, -0.04]), radiusEarth: m(1.1, [0.05, -0.05]) }))
    const t = text(html)
    expect(t).toContain('Habitable-zone flux · size in the rocky range')
    expect(t).toContain('Habitable-zone placement is not evidence of habitability or life')
    expect(html).toContain('hz-strip')
    for (const label of ['Habitable-zone placement (stellar flux)', 'Size (radius)', 'Mass', 'Surface gravity', 'Equilibrium temperature', 'Host star', 'Atmosphere']) expect(t).toContain(label)
    expect(t).toMatch(/Favourable.*Unknown/)
    expect(t).toContain('0.800 +0.050 −0.040') // uncertainty kept, asymmetric
    expect(html).toContain('href="https://ads/doe"') // original source
    expect(html).toContain('href="/habitability"')
    expect(t).not.toMatch(/%|probability|score/i)
  })

  it('explains why there is no placement when data is missing or the star is unsupported', () => {
    expect(text(render(planet({}, { teff: missing() })))).toContain('No stellar effective temperature in the catalogue.')
    const cool = text(render(planet({ insolationEarth: m(0.8) }, { teff: m(2400), spectralType: 'M9 V' })))
    expect(cool).toContain('Star outside the habitable-zone model')
    expect(cool).toContain('2,600–7,200 K')
  })

  it('shows the atmosphere as unknown for every planet', () => {
    expect(text(render(planet({ insolationEarth: m(1) })))).toContain('No atmospheric data in the NASA catalogue')
  })
})

describe('chart helpers', () => {
  it('maps flux on a reversed log scale and produces 1-2-5 ticks', () => {
    const s = fluxScale(10, 0.1, 0, 200)
    expect(s.toX(10)).toBe(0)
    expect(s.toX(1)).toBeCloseTo(100, 9)
    expect(s.toX(0.1)).toBeCloseTo(200, 9)
    expect(s.fromX(100)).toBeCloseTo(1, 9)
    expect(fluxTicks(10, 0.1)).toEqual([0.1, 0.2, 0.5, 1, 2, 5, 10])
  })

  it('builds closed band outlines over the model range and classifies sizes', () => {
    const poly = bandPolygon('runawayGreenhouse', 'maximumGreenhouse', 100)
    expect(poly[0][1]).toBe(2600)
    expect(poly.at(-1)[1]).toBe(2600)
    expect(poly.every(([f]) => f > 0)).toBe(true)
    expect([0.9, 1.6, 2, 2.5, 3, null].map(sizeClassOf)).toEqual(['small', 'small', 'mid', 'mid', 'large', 'unknown'])
    expect(withErr(1.005, [0.084, -0.079])).toBe('1.005 +0.084 −0.079') // precision follows the uncertainty
    expect(withErr(0.7, [0.02, -0.02])).toBe('0.700 ±0.020')
    expect(withErr(3457, null)).toBe('3,457')
  })
})
