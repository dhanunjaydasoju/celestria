import { describe, expect, it } from 'vitest'
import { FIXTURE_PLANETS } from './__fixtures__/planets.js'
import { createToolContext, runTool } from './tools/index.js'
import { extractNumbers, validateAnswer } from './validate.js'

const ctx = createToolContext(FIXTURE_PLANETS, { now: () => new Date('2026-10-31T00:00:00Z') })
const evidence = [
  runTool(ctx, 'get_planet', { name: 'Testa b' }),
  runTool(ctx, 'get_planet', { name: 'Testa c' }),
  runTool(ctx, 'get_planet', { name: 'Solo b' }),
  runTool(ctx, 'compare_planets', { names: ['Testa b', 'Testa c'] }),
  runTool(ctx, 'explain_concept', { concept: 'habitable zone' }),
]

const check = (claims, opts = {}) => validateAnswer({ sections: [{ title: 'Answer', claims }], ...opts.answer }, opts.evidence ?? evidence, opts)
const one = (text, basis, opts) => check([{ text, basis }], opts)
const rules = (r) => r.errors.map((e) => e.rule)

describe('validateAnswer: accepts faithful answers', () => {
  it('passes a well-labelled multi-claim answer and returns its links and sources', () => {
    const r = check(
      [
        { text: 'Testa b has a radius of 1.10 +0.05 −0.03 R⊕ (Doe et al. 2020).', basis: 'measured', refs: ['testa-b'] },
        { text: 'Its mass is 1.3 ±0.2 Earth masses and its equilibrium temperature 250 K.', basis: 'measured' },
        { text: 'Testa c has a minimum mass of 8.2 +0.9 −0.8 M⊕ (M sin i).', basis: 'minimum', refs: ['testa-c'] },
        { text: 'Surface gravity on Testa b is about 10.5 ±1.9 m/s².', basis: 'calculated' },
        { text: 'Testa b was discovered in 2020 by TESS.', basis: 'catalog' },
        { text: "Testa b's atmosphere composition is unavailable in the NASA catalogue.", basis: 'unavailable' },
        { text: 'Being in the habitable zone does not mean a planet is habitable.', basis: 'established' },
        { text: 'Whether Testa b has an atmosphere is unknown; if it does, it might retain heat.', basis: 'hypothesis' },
        { text: 'Testa b is classified as a Rocky world by its size.', basis: 'classification' },
      ],
      { answer: { planets: ['testa-b'] } },
    )
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.links.map((l) => l.profileUrl).sort()).toEqual(['/planet/testa-b', '/planet/testa-c'])
    expect(r.links[0].nasaOverviewUrl).toMatch(/^https:\/\/exoplanetarchive\.ipac\.caltech\.edu\/overview\//)
    expect(r.sources).toContainEqual({ label: 'Doe et al. 2020', url: 'https://ui.adsabs.harvard.edu/abs/2020Doe' })
    expect(r.checkedNumbers).toBe(6) // uncertainties are checked with their value
  })

  it('accepts tool-provided conversions, ratios, percentages and comma-grouped numbers', () => {
    expect(one('Testa b has 0.00409 Jupiter masses.', 'measured').ok).toBe(true)
    expect(one("Testa c's minimum mass is 6.308 times Testa b's mass.", 'calculated').ok).toBe(true)
    expect(one("Testa c's minimum mass is 631% of Testa b's.", 'calculated').ok).toBe(true)
    expect(one('Its star has an effective temperature of 3,200 K.', 'measured').ok).toBe(true)
  })

  it('ignores numbers inside planet and star designations', () => {
    const r = one('Like Kepler-452 b, HD 189733 b and 55 Cnc e, Testa b was found by the Transit method.', 'catalog')
    expect(r.errors).toEqual([])
  })

  it("allows the user's own numbers", () => {
    expect(one('No planet here is within 4 pc of the Sun.', 'catalog', { question: 'Which planets are within 4 pc?' }).errors).toEqual([])
  })
})

describe('validateAnswer: numbers', () => {
  it('rejects fabricated values', () => {
    expect(rules(one('Testa b has an equilibrium temperature of 2500 K.', 'measured'))).toEqual(['number'])
  })

  it('requires every number in a data claim to match, even small integers with unknown units', () => {
    expect(rules(one('The surface pressure on Testa b is about 1 bar.', 'measured'))).toEqual(['unit'])
    expect(rules(one('Testa b has a radius of about 1 R⊕.', 'measured'))).not.toEqual([])
    expect(one('Testa b is one of 2 planets around Testa.', 'catalog').ok).toBe(true) // narrative counts are only warned
  })

  it('rejects over-rounded values but accepts faithful rounding', () => {
    expect(one('Testa b has a radius of 1.1 R⊕.', 'measured').ok).toBe(true)
    expect(one('Testa b has a radius of 1 R⊕.', 'measured').ok).toBe(false) // 1 is in the data, but only as other quantities
  })

  it('rejects unit mismatches and unit conversions the tools did not provide', () => {
    expect(rules(one('Testa b takes 250 days to orbit.', 'measured'))).toEqual(['unit'])
    expect(rules(one('Testa b is about −23 °C.', 'calculated'))).toEqual(['unit'])
    expect(rules(one('A year on Testa b lasts 252 hours.', 'calculated'))).toEqual(['unit'])
  })
})

describe('validateAnswer: uncertainty', () => {
  it('rejects averaged asymmetric errors and invented uncertainties', () => {
    expect(rules(one('Testa b has a radius of 1.10 ±0.04 R⊕.', 'measured'))).toEqual(['uncertainty'])
    expect(rules(one('Testa b has a mass of 1.3 ±0.3 M⊕.', 'measured'))).toEqual(['uncertainty'])
    expect(rules(one('Testa c has a minimum mass of 8.2 +0.8 −0.9 M⊕.', 'minimum'))).toEqual(['uncertainty']) // sides swapped
    expect(rules(one('Testa b orbits at 0.05 ±0.01 AU.', 'measured'))).toEqual(['uncertainty'])
  })

  it('warns when one side of an asymmetric error is shown as ±', () => {
    const r = one('Testa b has a radius of 1.10 ±0.05 R⊕.', 'measured')
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.rule)).toContain('uncertainty')
  })
})

describe('validateAnswer: provenance labels', () => {
  it('rejects a label that does not match the data', () => {
    expect(rules(one('Testa c has a mass of at least 8.2 M⊕.', 'measured'))).toEqual(['provenance'])
    expect(rules(one('Testa b has a radius of 1.1 R⊕.', 'catalog'))).toEqual(['provenance'])
    expect(rules(one('Testa b has a radius of 1.1 R⊕.', 'established'))).toEqual(['provenance'])
    expect(rules(one('Solo b has a radius of 2.5 R⊕.', 'measured'))).toEqual(['provenance']) // calculated by NASA
  })

  it('requires minimum masses, limits, estimates and assumptions to be described as such', () => {
    expect(rules(one('Testa c has a mass of 8.2 M⊕.', 'minimum'))).toEqual(['minimum-mass'])
    expect(rules(one('Solo b receives 3 S⊕.', 'measured'))).toEqual(['limit'])
    expect(one('Solo b receives less than 3 S⊕ (an upper limit).', 'measured').ok).toBe(true)
    expect(rules(one('The eccentricity of Testa c is 0.', 'assumed'))).toEqual(['assumed'])
    expect(one('The eccentricity of Testa c was assumed to be 0 (circular).', 'assumed').ok).toBe(true)
    expect(one('Solo b has a mass of 6.9 M⊕.', 'estimated').warnings.map((w) => w.rule)).toContain('estimated')
  })

  it('rejects unavailable claims that quote values or do not say so', () => {
    expect(rules(one('The mass of Testa b is unavailable, around 1.3 M⊕.', 'unavailable'))).toEqual(['unavailable'])
    expect(rules(one('Testa c has a radius.', 'unavailable'))).toEqual(['unavailable'])
  })

  it('rejects data labels on claims with nothing from the data', () => {
    expect(rules(one('The planet is very dense.', 'measured'))).toEqual(['unsupported'])
  })

  it('never accepts imputed or unknown labels', () => {
    expect(rules(one('Testa c has an equilibrium temperature of 400 K.', 'imputed'))).toEqual(['imputed'])
    expect(rules(one('Testa c has an equilibrium temperature of 400 K.', 'measured'))).toEqual(['number']) // the imputed 400 K is not evidence
    expect(rules(one('Testa b is nice.', 'vibes'))).toEqual(['schema'])
  })
})

describe('validateAnswer: scientific claims', () => {
  it('rejects composition stated as fact, but allows hedged hypotheses and size classes', () => {
    expect(rules(one('Testa b has an iron core.', 'measured'))).toContain('composition')
    expect(rules(one('Testa b is a water world.', 'established'))).toContain('composition')
    expect(rules(one('The atmosphere of Testa b is mostly nitrogen.', 'measured'))).toContain('composition')
    expect(one('Testa b might have a rocky surface, but its composition is unknown.', 'hypothesis').ok).toBe(true)
    expect(rules(one('Testa b is a Rocky world.', 'classification'))).toEqual(['classification'])
    expect(rules(one('Solo b is a sub-Neptune with a radius of 2.5 R⊕.', 'calculated'))).toEqual(['classification'])
    expect(rules(one('Testa b has a radius of 1.1 R⊕, suggesting it is not rocky.', 'measured'))).toEqual(expect.arrayContaining(['composition', 'interpretation']))
    expect(rules(one('Testa b has a radius of 1.1 R⊕, so it is probably small.', 'measured'))).toEqual(['interpretation'])
    expect(one('Testa b has a radius of 1.1 R⊕, making it slightly larger than Earth.', 'measured').ok).toBe(true)
  })

  it('rejects habitable-zone placement unless hedged', () => {
    expect(rules(one('Testa b lies in the habitable zone.', 'measured'))).toContain('habitable-zone')
    expect(rules(one('It receives 0.9 ±0.1 S⊕, placing it near the inner edge of the habitable zone.', 'measured'))).toContain('habitable-zone')
    expect(rules(one('Testa b orbits outside the habitable zone.', 'established'))).toContain('habitable-zone')
    expect(one('Testa b could lie within the habitable zone, depending on the model used.', 'hypothesis').ok).toBe(true)
  })

  it('rejects habitability and life assertions; allows negations and hedged speculation', () => {
    expect(rules(one('Testa b is potentially habitable.', 'hypothesis'))).toContain('habitability')
    expect(rules(one('Testa b is habitable.', 'established'))).toContain('habitability')
    expect(rules(one('Testa b is an Earth-like planet.', 'established'))).toContain('habitability')
    expect(rules(one('Testa b is not habitable.', 'established'))).toContain('habitability')
    expect(rules(one('Testa b has life.', 'hypothesis'))).toEqual(expect.arrayContaining(['habitability', 'life']))
    expect(one('Testa b is not known to be habitable, and there is no evidence of life.', 'established').ok).toBe(true)
    expect(one('If Testa b has an atmosphere, it might be able to host life, but this is speculative.', 'hypothesis').ok).toBe(true)
    expect(one('Testa b is Earth-like in size.', 'established').ok).toBe(true)
  })
})

describe('validateAnswer: rankings', () => {
  const search = [...evidence, runTool(ctx, 'search_planets', { mass_min: 0, sort_by: 'distance', include_controversial: true })]
  // Distance order: Testa b, Testa c (5.5 pc), Disputed b (8 pc), Solo b (40 pc), Far b (no distance).
  it('accepts rankings that match a search sorted by that property', () => {
    expect(one('Testa b is the closest of these planets.', 'catalog', { evidence: search }).errors).toEqual([])
    expect(one('Disputed b is the third closest.', 'catalog', { evidence: search }).errors).toEqual([])
    expect(one('Solo b is one of the closest.', 'catalog', { evidence: search }).errors).toEqual([])
  })

  it('rejects wrong ranks and rankings without a matching sorted search', () => {
    expect(rules(one('Solo b is the second closest.', 'catalog', { evidence: search }))).toEqual(['ranking'])
    expect(rules(one('Testa b is the largest planet here.', 'catalog', { evidence: search }))).toEqual(['ranking'])
  })
})

describe('validateAnswer: sources, links and planets', () => {
  it('accepts citations from the evidence in either style and rejects invented ones', () => {
    expect(one('The radius of Testa b, 1.1 R⊕, comes from Doe et al. (2020).', 'measured').ok).toBe(true)
    expect(one('Its eccentricity of 0.10 comes from Roe & Poe 2022.', 'measured').ok).toBe(true)
    expect(rules(one('Smith et al. 2019 measured a radius of 1.1 R⊕ for Testa b.', 'measured'))).toEqual(['citation'])
  })

  it('only allows links and planet ids returned by the tools', () => {
    expect(one('See the [Testa b profile](/planet/testa-b) for its radius of 1.1 R⊕.', 'measured').ok).toBe(true)
    expect(rules(one('See [Kepler-22 b](/planet/kepler-22-b).', 'catalog'))).toContain('link')
    expect(rules(one('More at https://example.com/testa for Testa b.', 'catalog'))).toContain('link')
    expect(rules(check([{ text: 'Testa b was found by TESS.', basis: 'catalog', refs: ['kepler-22-b'] }]))).toEqual(['planet-ref'])
    expect(rules(check([{ text: 'Testa b was found by TESS.', basis: 'catalog' }], { answer: { planets: ['nope'] } }))).toEqual(['planet-ref'])
  })

  it('rejects dates the tools did not produce', () => {
    const orbit = [...evidence, runTool(ctx, 'compute_orbit', { name: 'Testa b', at: 'next_transit' })]
    const date = orbit.at(-1).result.position.dateUtc.slice(0, 10)
    expect(one(`The next transit of Testa b is on ${date}.`, 'calculated', { evidence: orbit }).errors).toEqual([])
    expect(rules(one('The next transit of Testa b is on 2031-02-03.', 'calculated', { evidence: orbit }))).toEqual(['date'])
  })
})

describe('validateAnswer: structure', () => {
  it('rejects malformed answers', () => {
    expect(validateAnswer(null, evidence).ok).toBe(false)
    expect(validateAnswer({ sections: [] }, evidence).errors[0].rule).toBe('schema')
    expect(validateAnswer({ sections: [{ claims: [] }] }, evidence).errors[0].rule).toBe('schema')
    expect(rules(one('', 'measured'))).toEqual(['schema'])
  })
})

describe('extractNumbers', () => {
  it('reads values, units and uncertainties', () => {
    expect(extractNumbers('0.920 +0.013 −0.012 R⊕, 249.7 ±2.4 K and −3.26 dex, 2,566 K, 12%')).toEqual([
      expect.objectContaining({ value: 0.92, unit: 'R⊕', unc: { plus: '0.013', minus: '0.012' } }),
      expect.objectContaining({ value: 249.7, unit: 'K', unc: { sym: '2.4' } }),
      expect.objectContaining({ value: -3.26, unit: 'dex' }),
      expect.objectContaining({ value: 2566, unit: 'K' }),
      expect.objectContaining({ value: 12, unit: '%' }),
    ])
    expect(extractNumbers('0.8–1.25 Earth radii').map((n) => n.value)).toEqual([0.8, 1.25])
  })
})
