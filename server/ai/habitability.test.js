import { describe, expect, it } from 'vitest'
import { missing, quantity } from '../../src/contracts/planet.js'
import { habitableZoneFlux } from '../../src/science/habitableZone.js'
import { ANSWER_TESTA_B, fixtureContext, json, scriptedClient, testConfig } from './__fixtures__/fakeProvider.js'
import { FIXTURE_PLANETS } from './__fixtures__/planets.js'
import { createLimiter } from './limits.js'
import { createAstronomer } from './orchestrator.js'
import { createToolContext, runTool } from './tools/index.js'
import { validateAnswer } from './validate.js'

const m = (value, err, extra = {}) => quantity(value, 'measured', { err, source: { label: 'Doe et al. 2020', url: 'https://x' }, ...extra })
const s = habitableZoneFlux(5780)
const base = FIXTURE_PLANETS[0]
const make = (name, fields, star = {}) => ({ ...structuredClone(base), id: name.toLowerCase().replace(/\s+/g, '-'), name, host: name.split(' ')[0], ...fields, star: { ...structuredClone(base.star), name: name.split(' ')[0], ...star } })
const PLANETS = [
  make('Cons b', { insolationEarth: m(0.7, [0.02, -0.02]), radiusEarth: m(1.1, [0.05, -0.05]) }, { teff: m(5780, [20, -20]), spectralType: 'G2 V' }),
  make('Opt b', { insolationEarth: m(1.4, [0.02, -0.02]) }, { teff: m(5780, [20, -20]), spectralType: 'G2 V' }),
  make('Edge b', { insolationEarth: m(s.runawayGreenhouse - 0.01, [0.05, -0.05]) }, { teff: m(5780, [20, -20]), spectralType: 'G2 V' }),
  make('Hot b', { insolationEarth: m(40, [2, -2]) }, { teff: m(5780, [20, -20]), spectralType: 'G2 V' }),
  make('Cold b', { insolationEarth: m(0.05, [0.005, -0.005]) }, { teff: m(5780, [20, -20]), spectralType: 'G2 V' }),
  make('Coolstar b', { insolationEarth: m(0.7, [0.02, -0.02]) }, { teff: m(2500, [20, -20]), spectralType: 'M9 V' }),
  make('Giant b', { insolationEarth: m(0.7, [0.02, -0.02]) }, { teff: m(4800, [20, -20]), spectralType: 'K0 III' }),
  // Imputed flux and no luminosity: nothing real to place it with.
  make('Gapfill b', { insolationEarth: quantity(0.7, 'imputed') }, { teff: m(5780, [20, -20]), lumLog: missing() }),
]
const ctx = createToolContext(PLANETS)
const tool = (name) => runTool(ctx, 'assess_habitability', { name })
const one = (text, basis, evidence) => validateAnswer({ sections: [{ title: 'Zone', claims: [{ text, basis }] }] }, evidence)
const rules = (r) => r.errors.map((e) => e.rule)

describe('assess_habitability tool', () => {
  it('reports placement, boundaries with their basis, provenance and indicators', () => {
    const r = tool('Cons b').result
    expect(r).toMatchObject({ status: 'ok', planet: 'Cons b', host: 'Cons', profileUrl: '/planet/cons-b', dashboardUrl: '/habitability' })
    expect(r.habitableZone).toMatchObject({ status: 'placed', placement: 'conservative', straddles: false, planetFlux: { value: 0.7, status: 'measured', source: { label: 'Doe et al. 2020' } } })
    expect(r.habitableZone.boundaryFlux.runawayGreenhouse).toMatchObject({ status: 'calculated', unit: 'S⊕', basis: expect.stringMatching(/Kopparapu et al. 2014/) })
    expect(r.indicators.map((i) => i.key)).toEqual(['flux', 'size', 'mass', 'gravity', 'eqTemp', 'star', 'atmosphere'])
    expect(r.indicators.at(-1)).toMatchObject({ assessment: 'Unknown' })
    expect(r.tier.note).toMatch(/not a probability or score/)
    expect(JSON.stringify(r)).not.toMatch(/%|probability of|is habitable/i)
  })

  it('explains unsupported stars, evolved hosts, missing and imputed inputs', () => {
    expect(tool('Coolstar b').result.habitableZone).toMatchObject({ status: 'unsupported_teff', placement: null, reason: expect.stringMatching(/2,600–7,200 K/) })
    expect(tool('Giant b').result.habitableZone).toMatchObject({ status: 'unsupported_star' })
    const imputed = tool('Gapfill b').result
    expect(imputed.habitableZone).toMatchObject({ status: 'no_flux', planetFlux: { status: 'unavailable' } })
    expect(JSON.stringify(imputed)).not.toContain('imputed')
  })

  it('handles ambiguous and unknown names like the other tools', () => {
    expect(runTool(createToolContext(FIXTURE_PLANETS), 'assess_habitability', { name: 'Testa' }).result.status).toBe('ambiguous')
    expect(tool('Nope b').result.status).toBe('not_found')
  })
})

describe('validator: habitable-zone claims need assess_habitability', () => {
  const ev = ['Cons b', 'Opt b', 'Edge b', 'Hot b', 'Cold b', 'Coolstar b'].map(tool)

  it('accepts placement claims that match the tool, labelled calculated', () => {
    expect(one('Cons b lies within the conservative habitable zone.', 'calculated', ev).errors).toEqual([])
    expect(one('Cons b lies in the habitable zone.', 'calculated', ev).errors).toEqual([]) // unqualified = conservative
    expect(one('Cons b lies within the optimistic habitable zone.', 'calculated', ev).errors).toEqual([]) // conservative ⊂ optimistic
    expect(one('Opt b lies in the optimistic habitable zone but outside the conservative habitable zone.', 'calculated', ev).errors).toEqual([])
    expect(one('Hot b receives more starlight than the inner edge of the habitable zone.', 'calculated', ev).errors).toEqual([])
    expect(one('Cold b lies outside the habitable zone.', 'calculated', ev).errors).toEqual([])
    expect(one('Edge b is near the inner edge of the habitable zone, within its uncertainties.', 'calculated', ev).errors).toEqual([])
  })

  it('rejects placements that contradict the tool', () => {
    expect(rules(one('Opt b lies in the habitable zone.', 'calculated', ev))).toEqual(['habitable-zone']) // only optimistic
    expect(rules(one('Opt b lies within the conservative habitable zone.', 'calculated', ev))).toEqual(['habitable-zone'])
    expect(rules(one('Hot b lies in the habitable zone.', 'calculated', ev))).toEqual(['habitable-zone'])
    expect(rules(one('Cons b lies outside the habitable zone.', 'calculated', ev))).toEqual(['habitable-zone'])
    expect(rules(one('Cons b is near the outer edge of the habitable zone.', 'calculated', ev))).toEqual(['habitable-zone']) // not straddling
    expect(rules(one('Coolstar b lies in the habitable zone.', 'calculated', ev))).toEqual(['habitable-zone']) // model does not apply
  })

  it('requires the calculated label and still forbids habitability or life claims', () => {
    expect(rules(one('Cons b lies within the conservative habitable zone.', 'measured', ev))).toEqual(['habitable-zone'])
    expect(rules(one('Cons b lies within the conservative habitable zone, so it is habitable.', 'calculated', ev))).toEqual(expect.arrayContaining(['habitability']))
    expect(rules(one('Cons b lies within the conservative habitable zone and supports life.', 'calculated', ev))).toEqual(expect.arrayContaining(['habitability', 'life']))
  })

  it('allows headings that name the zone but not headings that place a planet', () => {
    const answer = (title) => validateAnswer({ sections: [{ title, claims: [{ text: 'Cons b lies within the conservative habitable zone.', basis: 'calculated' }] }] }, ev)
    expect(answer('Habitable-zone placement').ok).toBe(true)
    expect(rules(answer('Cons b is in the habitable zone'))).toContain('habitable-zone')
  })

  it('treats general statements as general, and pronouns as the assessed planet', () => {
    const single = [tool('Opt b')]
    expect(one('Being in the habitable zone does not mean a planet is habitable.', 'established', [...single, runTool(ctx, 'explain_concept', { concept: 'habitable zone' })]).errors).toEqual([])
    expect(rules(one('It lies within the conservative habitable zone.', 'calculated', single))).toContain('habitable-zone')
    expect(one('It lies within the optimistic habitable zone.', 'calculated', single).errors).toEqual([])
  })

  it('keeps the strict rule when the tool was not called', () => {
    expect(rules(one('Cons b lies within the conservative habitable zone.', 'calculated', [runTool(ctx, 'get_planet', { name: 'Cons b' })]))).toEqual(['habitable-zone'])
    expect(one('Cons b might lie in the habitable zone, but this has not been calculated.', 'hypothesis', [runTool(ctx, 'get_planet', { name: 'Cons b' })]).errors).toEqual([])
  })

  it('checks boundary numbers against the tool and links the host star', () => {
    const r = tool('Cons b').result
    const inner = r.habitableZone.boundaryDistance?.conservativeInner
    if (inner) {
      expect(one(`The conservative habitable zone of Cons starts at ${inner.display}.`, 'calculated', ev).errors).toEqual([])
      expect(rules(one('The conservative habitable zone of Cons starts at 0.123 AU.', 'calculated', ev))).toContain('number')
    }
  })
})

describe('orchestrator: habitability questions', () => {
  it('pre-retrieves assess_habitability for planets named in a habitability question', async () => {
    const config = testConfig()
    const client = scriptedClient([json(ANSWER_TESTA_B)])
    const tc = fixtureContext()
    const astronomer = createAstronomer({ config, client, limiter: createLimiter(config.limits), getToolContext: () => tc })
    const r = await astronomer.ask({ question: 'Could Testa b support life?', clientKey: 'x' })
    expect(r.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['get_planet', 'assess_habitability', 'explain_concept']))
    expect(client.requests[0].messages.some((m) => m.role === 'tool' && m.content.includes('"habitableZone"'))).toBe(true)
  })

  it('does not run it for unrelated questions', async () => {
    const config = testConfig()
    const tc = fixtureContext()
    const astronomer = createAstronomer({ config, client: scriptedClient([json(ANSWER_TESTA_B)]), limiter: createLimiter(config.limits), getToolContext: () => tc })
    const r = await astronomer.ask({ question: 'How big is Testa b?', clientKey: 'x' })
    expect(r.tools.map((t) => t.name)).not.toContain('assess_habitability')
  })
})

describe('missing star data', () => {
  it('reports no placement without a stellar temperature', () => {
    const p = make('Notemp b', { insolationEarth: m(1, [0.1, -0.1]) }, { teff: missing(), spectralType: null })
    const r = runTool(createToolContext([p]), 'assess_habitability', { name: 'Notemp b' }).result
    expect(r.habitableZone).toMatchObject({ status: 'no_teff', placement: null })
    expect(r.tier.label).toBe('Insufficient data for placement')
  })
})
