import { describe, expect, it } from 'vitest'
import { ANSWER_TESTA_B, json, testConfig, scriptedClient, fixtureContext } from './__fixtures__/fakeProvider.js'
import { FIXTURE_PLANETS } from './__fixtures__/planets.js'
import { createLimiter } from './limits.js'
import { createAstronomer } from './orchestrator.js'
import { packingClaims, volumeCounts } from './packing.js'
import { repairPrompt, systemPrompt } from './prompts.js'
import { createToolContext, runTool } from './tools/index.js'
import { validateAnswer } from './validate.js'

const NAMES = ['Testa b', 'TRAPPIST-1 e']
const packs = (text) => packingClaims([text], { names: NAMES }).length > 0

describe('packing claims are rejected in any wording', () => {
  const rejected = [
    // the five required examples
    '1 million planets fit inside the Sun.',
    'The Sun could hold 1 million Earths.',
    'You could pack 500 planets into the Sun.',
    'The Sun has room for 500 of these worlds.',
    'About a million copies of Testa b would fit inside the Sun.',
    // synonyms
    'The Sun could contain about a million Earths.',
    'Our Sun can accommodate roughly 1,300 Jupiters.',
    'You could squeeze 50 such planets into the Sun.',
    'The Sun could store thousands of these worlds.',
    'A million Earths would be swallowed and housed by the Sun.',
    'The Sun has space for many planets like TRAPPIST-1 e.',
    'The Sun would be filled with Earths if you poured them in.',
    "The Sun's interior could hold a million Earths.",
    // reversed structures
    'Inside the Sun, you could fit 1.3 million Earths.',
    'Into the Sun you could pack about 500 planets.',
    'A million Earths could be contained by the Sun.',
    'Placed into the Sun, these planets would number 900.',
    // no numbers
    'Many planets could fit inside the Sun.',
    'The Sun could hold a lot of these worlds.',
    'Lots of Earths would fit into our Sun.',
  ]
  for (const text of rejected) it(`rejects: ${text}`, () => expect(packs(text)).toBe(true))

  it('catches a claim split over two sentences in one claim', () => {
    expect(packs('Picture the Sun as a container. It could hold about a million copies of TRAPPIST-1 e.')).toBe(true)
  })

  it('catches a claim split across two adjacent claims', () => {
    const hits = packingClaims(['Think of the Sun as an enormous sphere.', 'It could hold about a million copies of Testa b.'], { names: NAMES })
    expect(hits).toEqual([{ index: 1, text: 'It could hold about a million copies of Testa b.' }])
  })
})

describe('legitimate scientific language is allowed', () => {
  const accepted = [
    'The planet is larger than Earth.',
    'The Sun has a greater volume than Earth.',
    'Its volume is equivalent to approximately 1302096 Earth volumes.',
    'The Sun has about 1302096 times the volume of Earth.',
    'SUNFALL is a mathematical volume comparison; packing and arrangement are not represented.',
    'The planet orbits its host star.',
    'Testa b lies inside the conservative habitable zone of its star.',
    'Mercury orbits inside the orbit of Venus.',
    'Inside the Sun, nuclear fusion converts hydrogen into helium.',
    'The Sun contains about 99.8% of the mass of the Solar System.',
    "The Sun's gravity holds the planets in their orbits.",
    'The Sun holds eight planets in orbit.',
    'Planets cannot actually be packed into the Sun without gaps.',
    'Identical spheres cannot fill a larger sphere without gaps, so this is not a packing count.',
    'It does not mean that a million Earths would fit inside the Sun.',
    'The radius was fitted to the transit light curve of a Sun-like star.',
    'This model is a best-fit to the data for planets around Sun-like stars.',
    'Testa b would fit within the radius range of super-Earths.',
    'The planets of TRAPPIST-1 would fit inside the orbit of Mercury.',
  ]
  for (const text of accepted) it(`accepts: ${text}`, () => expect(packs(text)).toBe(false))

  it('does not link unrelated adjacent claims', () => {
    expect(packingClaims(['The Sun is a G-type star.', 'Testa b orbits its star every 10.5 days.'], { names: NAMES })).toEqual([])
    expect(packingClaims(['The Sun is a G-type star.', 'Its light holds no information about planets.'], { names: NAMES })).toEqual([])
  })
})

describe('volume counts in number words', () => {
  it('flags counts no tool can provide', () => {
    expect(volumeCounts('The Sun has about 1.3 million times the volume of Earth.')).toHaveLength(1)
    expect(volumeCounts('Its volume is equivalent to about a million Earth volumes.')).toHaveLength(1)
    expect(volumeCounts('That is thousands of planet volumes.')).toHaveLength(1)
    expect(volumeCounts('The Sun is volume-equivalent to one hundred thousand such planets.')).toHaveLength(1)
  })

  it('leaves other sentences alone', () => {
    expect(volumeCounts('The Sun has a much greater volume than Earth.')).toEqual([])
    expect(volumeCounts('The catalogue lists thousands of planets.')).toEqual([])
    expect(volumeCounts('Its volume is equivalent to 1302096 Earth volumes.')).toEqual([]) // digits: checked against the evidence
  })
})

// ── Through the validator ──────────────────────────────────────────────────
const ctx = createToolContext(FIXTURE_PLANETS, { now: () => new Date('2026-10-31T00:00:00Z') })
const evidence = [runTool(ctx, 'get_planet', { name: 'Testa b' })]
const answer = (claims, title = 'Size') => ({ sections: [{ title, claims }], planets: ['testa-b'] })
const rules = (r) => r.errors.map((e) => e.rule)
const RADIUS = { text: 'Testa b has a radius of 1.10 +0.05 −0.03 R⊕ (Doe et al. 2020).', basis: 'measured', refs: ['testa-b'] }

describe('validateAnswer: SUNFALL rules', () => {
  it('fails a packing claim with the packing rule, whatever its basis', () => {
    for (const basis of ['hypothesis', 'established', 'calculated']) {
      const r = validateAnswer(answer([RADIUS, { text: 'Many copies of Testa b could fit inside the Sun.', basis }]), evidence)
      expect(r.ok).toBe(false)
      expect(rules(r)).toContain('packing')
      expect(r.errors.find((e) => e.rule === 'packing')).toMatchObject({ section: 0, claim: 1 })
    }
  })

  it('fails packing across adjacent claims and in titles', () => {
    const r = validateAnswer(answer([{ text: 'Consider the Sun as a sphere.', basis: 'established' }, { text: 'It could hold many copies of Testa b.', basis: 'hypothesis' }]), evidence)
    expect(r.errors.filter((e) => e.rule === 'packing')).toEqual([expect.objectContaining({ claim: 1 })])
    const t = validateAnswer(answer([RADIUS], 'How many planets fit inside the Sun'), evidence)
    expect(rules(t)).toContain('packing')
  })

  it('rejects an invented count even when its digits match unrelated catalogue values', () => {
    // "1" is a catalogue value (star count), so the number rule alone would pass "1 million".
    const r = validateAnswer(answer([RADIUS, { text: 'The Sun has 1 million times the volume of Testa b.', basis: 'calculated' }]), evidence)
    expect(rules(r)).toContain('volume-count')
    const d = validateAnswer(answer([RADIUS, { text: 'The Sun has about 1302096 times the volume of Testa b.', basis: 'calculated' }]), evidence)
    expect(rules(d)).toContain('volume-count')
  })

  it('accepts a count only when a tool result provides that exact value', () => {
    const authorised = [...evidence, { name: 'catalog_facts', args: {}, result: { status: 'ok', sunVolumeEquivalent: 1302096 } }]
    const r = validateAnswer(answer([RADIUS, { text: 'The Sun has about 1302096 times the volume of Earth.', basis: 'calculated' }]), authorised)
    expect(rules(r)).not.toContain('volume-count')
  })

  it('accepts volume-equivalence explanations without a count', () => {
    const r = validateAnswer(
      answer([
        RADIUS,
        { text: 'SUNFALL is a mathematical volume comparison, not a packing count.', basis: 'established' },
        { text: 'The Sun has a far greater volume than Testa b.', basis: 'established' },
        { text: 'Identical spheres cannot fill a larger sphere without gaps.', basis: 'established' },
      ]),
      evidence,
    )
    expect(r.errors).toEqual([])
  })
})

describe('prompts', () => {
  it('tells the model SUNFALL is a volume equivalence, not packing, and gives no counts', () => {
    const p = systemPrompt()
    expect(p).toMatch(/mathematical volume equivalence/)
    expect(p).toMatch(/not physical packing/)
    expect(p).toMatch(/fit, are packed, placed, squeezed or contained inside the Sun/)
    expect(p).toMatch(/hold, contain or has room for them/)
    expect(p).toMatch(/volume-equivalent to/)
    expect(p).toMatch(/No tool provides SUNFALL counts: never calculate, estimate or recall one/)
  })

  it('asks for a rewrite as a volume equivalence, not a silent deletion', () => {
    const p = repairPrompt([{ rule: 'packing', message: 'x', text: 'y' }], { toolsAllowed: true })
    expect(p).toMatch(/Rewrite every packing claim as a volume equivalence/)
    expect(p).toMatch(/Do not just delete the sentence/)
    expect(repairPrompt([{ rule: 'volume-count', message: 'x' }], { toolsAllowed: false })).toMatch(/Do not give a SUNFALL volume count/)
    expect(repairPrompt([{ rule: 'number', message: 'x' }], { toolsAllowed: false })).not.toMatch(/packing|SUNFALL/)
  })
})

// ── End to end: repair, then a safe reply ──────────────────────────────────
const PACKING_ANSWER = {
  type: 'answer',
  sections: [{ title: 'Size', claims: [RADIUS, { text: 'About a million copies of Testa b would fit inside the Sun.', basis: 'hypothesis' }] }],
  planets: ['testa-b'],
}
const SPLIT_PACKING = {
  type: 'answer',
  sections: [{ title: 'Size', claims: [RADIUS, { text: 'Imagine the Sun as a box.', basis: 'hypothesis' }, { text: 'It might hold many copies of Testa b.', basis: 'hypothesis' }] }],
  planets: ['testa-b'],
}

function setup(script, limits = {}) {
  const config = testConfig(limits)
  const client = scriptedClient(script)
  const tc = fixtureContext()
  const astronomer = createAstronomer({ config, client, limiter: createLimiter(config.limits), getToolContext: () => tc, log: () => {} })
  return { client, ask: (question) => astronomer.ask({ question, clientKey: 'c1', planetId: 'testa-b' }) }
}

describe('orchestrator: packing claims never reach the user', () => {
  it('repairs a packing answer and shows only the corrected one', async () => {
    const { ask, client } = setup([json(PACKING_ANSWER), json(ANSWER_TESTA_B)])
    const r = await ask('How many Testa b would fit in the Sun?')
    expect(r.status).toBe('answered')
    expect(r.validation.repairs).toBe(1)
    expect(JSON.stringify(r)).not.toMatch(/fit inside the Sun|a million copies/)
    expect(client.requests[1].messages.at(-1).content).toMatch(/Rewrite every packing claim as a volume equivalence/)
  })

  it('ends with the fixed safe reply when repairs keep packing, exposing no model text', async () => {
    const { ask, client } = setup([json(PACKING_ANSWER), json(SPLIT_PACKING), json(PACKING_ANSWER)], { AI_MAX_REPAIR_ATTEMPTS: 2 })
    const r = await ask('How many Testa b would fit in the Sun?')
    expect(r.status).toBe('unverified')
    expect(r.sections).toEqual([])
    expect(r.validation.issues).toEqual(['packing'])
    expect(r.message).toMatch(/a volume comparison described as fitting or packing planets inside the Sun/)
    const shown = JSON.stringify(r)
    expect(shown).not.toMatch(/a million copies|might hold|Imagine the Sun as a box|fit inside the Sun\./)
    expect(client.requests).toHaveLength(3)
  })

  it('also withholds packing claims inside an "insufficient data" reply', async () => {
    const insufficient = { type: 'insufficient_data', sections: [{ title: 'Size', claims: [{ text: 'Many copies of Testa b could fit inside the Sun.', basis: 'hypothesis' }] }] }
    const { ask } = setup([json(insufficient)])
    const r = await ask('How many Testa b would fit in the Sun?')
    expect(r.status).toBe('insufficient_data')
    expect(r.sections).toEqual([])
    expect(JSON.stringify(r)).not.toMatch(/fit inside the Sun/)
  })
})
