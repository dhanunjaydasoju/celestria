import { describe, expect, it } from 'vitest'
import { labPlanets } from '../../src/three/lab/fixtures.js'
import { fixtureContext, json, scriptedClient, testConfig } from './__fixtures__/fakeProvider.js'
import { compatible, mentions, subjectAt } from './entities.js'
import { createLimiter } from './limits.js'
import { createAstronomer } from './orchestrator.js'
import { repairPrompt, systemPrompt } from './prompts.js'
import { createToolContext, runTool } from './tools/index.js'
import { buildEvidence, validateAnswer } from './validate.js'

// Real NASA rows (lab fixtures): TRAPPIST-1 e (0.920 R⊕, P = 6.101013 d) and
// its host star TRAPPIST-1 (0.1192 R☉, 2,566 K); TRAPPIST-1 f has its own period.
const ctx = createToolContext(labPlanets, { now: () => new Date('2026-11-03T00:00:00Z') })
const evidence = [runTool(ctx, 'get_planet', { name: 'TRAPPIST-1 e' }), runTool(ctx, 'get_planet', { name: 'TRAPPIST-1 f' })]
const check = (claims) => validateAnswer({ sections: [{ title: 'Answer', claims: claims.map((c) => (typeof c === 'string' ? { text: c, basis: 'measured' } : c)) }] }, evidence)
const attribution = (r) => r.errors.filter((e) => e.rule === 'attribution')
const wrong = (...claims) => attribution(check(claims)).length > 0

describe('evidence knows whose value each number is', () => {
  const ev = buildEvidence(evidence)
  const owners = (value, unit) => ev.numbers.filter((n) => n.value === value && n.unit === unit).map((n) => n.entity && `${n.entity.kind}:${n.entity.name}`)

  it('tags planet, host-star and Earth values with their owner', () => {
    expect(owners(0.92, 'R⊕')).toEqual(['planet:TRAPPIST-1 e'])
    expect(owners(0.1192, 'R☉')).toEqual(['star:TRAPPIST-1', 'star:TRAPPIST-1']) // from both planets' records
    expect(owners(2566, 'K')).toContain('star:TRAPPIST-1')
    expect(owners(6.101013, 'days')).toEqual(['planet:TRAPPIST-1 e'])
    expect(owners(365.25, 'days')).toContain('earth:earth')
  })
})

describe('rejects values attributed to the wrong object', () => {
  it('the live Q3 failure: a host-star radius presented as the Sun’s', () => {
    const r = check(['The Sun has a radius of 0.1192 R☉, measured by Agol et al. 2021.'])
    expect(r.ok).toBe(false)
    expect(attribution(r)[0].message).toMatch(/0\.1192 R☉ is given to the Sun, but in the tool results it belongs to TRAPPIST-1/)
  })

  const cases = {
    'the Sun, possessive': "Our Sun's radius is 0.1192 R☉.",
    'the Sun, temperature': 'The Sun has an effective temperature of 2,566 K.',
    'reversed structure': '0.1192 R☉ is the radius of the Sun.',
    'star value given to the planet': 'TRAPPIST-1 e has a radius of 0.1192 R☉.',
    'planet value given to the star': 'TRAPPIST-1 has a radius of 0.920 R⊕.',
    'planet value given to Earth': 'Earth has a radius of 0.920 R⊕.',
    'another planet in the same system': 'TRAPPIST-1 f has an orbital period of 6.101013 days.',
    'Earth reference value given to the planet': 'TRAPPIST-1 e has a year of 365.25 days.',
  }
  for (const [label, text] of Object.entries(cases)) it(label, () => expect(wrong(text)).toBe(true))

  it('follows "it/its" to the previous sentence', () => {
    expect(wrong('The Sun is a G-type star. Its radius is 0.1192 R☉.')).toBe(true)
  })

  it('follows "it/its" across adjacent claims', () => {
    expect(wrong({ text: 'Consider the Sun, a G-type star.', basis: 'hypothesis' }, 'It has a radius of 0.1192 R☉.')).toBe(true)
  })
})

describe('accepts correctly attributed values', () => {
  const ok = [
    'TRAPPIST-1 has a radius of 0.1192 R☉.',
    'The host star TRAPPIST-1 has an effective temperature of 2,566 K.',
    'Its host star, TRAPPIST-1, has a radius of 0.1192 R☉.',
    'TRAPPIST-1, unlike the Sun, has a radius of 0.1192 R☉.',
    'TRAPPIST-1 is much smaller than the Sun, with a radius of 0.1192 R☉.',
    'The Sun is far larger than TRAPPIST-1, whose radius is 0.1192 R☉.',
    'TRAPPIST-1 e orbits a 2,566 K star.',
    'TRAPPIST-1 e has a radius of 0.920 +0.013 −0.012 R⊕.',
    'TRAPPIST-1 e has a radius of 0.920 +0.013 −0.012 R⊕, smaller than Earth.',
    "Earth's year lasts 365.25 days, while TRAPPIST-1 e's lasts 6.101013 days.",
    'TRAPPIST-1 e completes an orbit every 6.101013 days. It was discovered in 2017.',
  ]
  for (const text of ok) it(text, () => expect(attribution(check([text]))).toEqual([]))

  it('leaves unitless numbers and statements with no named object alone', () => {
    expect(attribution(check([{ text: 'The TRAPPIST-1 system has 7 known planets.', basis: 'catalog' }]))).toEqual([])
    expect(attribution(check([{ text: 'Planets smaller than 1.6 R⊕ are often rocky.', basis: 'hypothesis' }]))).toEqual([])
  })
})

describe('entity helpers', () => {
  const names = { planets: ['TRAPPIST-1 e', 'TRAPPIST-1 f'], stars: ['TRAPPIST-1'] }

  it('finds planets before their host star, and skips Earth/Sun used as units', () => {
    const ms = mentions('TRAPPIST-1 e orbits TRAPPIST-1 and is 0.692 Earth masses; the Sun is larger.', names)
    expect(ms.map((m) => [m.kind, m.name])).toEqual([
      ['planet', 'TRAPPIST-1 e'],
      ['star', 'TRAPPIST-1'],
      ['sun', 'the Sun'],
    ])
  })

  it('treats an unknown owner as compatible, never as a failure', () => {
    expect(compatible({ kind: 'sun' }, null)).toBe(true)
    expect(compatible({ kind: 'sun' }, { kind: 'star', name: 'TRAPPIST-1' })).toBe(false)
    expect(compatible({ kind: 'star', name: null }, { kind: 'star', name: 'TRAPPIST-1' })).toBe(true)
  })

  it('gives no subject to a sentence that names nothing and has no pronoun', () => {
    expect(subjectAt('Radii are measured in transits.', 5, [], { kind: 'sun' })).toBeNull()
  })
})

describe('prompts', () => {
  it('distinguishes the Sun from host stars, and objects from each other', () => {
    const p = systemPrompt()
    expect(p).toMatch(/The Sun \(our star, 1 R☉ and 1 M☉ by definition\) is NOT the planet's host star/)
    expect(p).toMatch(/A planet's values are not its star's, one planet's values are not another planet's, and Earth's reference values belong only to Earth/)
  })

  it('asks for corrected attribution on repair', () => {
    expect(repairPrompt([{ rule: 'attribution', message: 'x' }], { toolsAllowed: true })).toMatch(/Correct every misattributed value[\s\S]*The Sun is not the host star/)
  })
})

// ── End to end: repair, then a safe reply (fake provider, Testa system) ────
const RADIUS = { text: 'Testa b has a radius of 1.10 +0.05 −0.03 R⊕ (Doe et al. 2020).', basis: 'measured', refs: ['testa-b'] }
const MISATTRIBUTED = {
  type: 'answer',
  sections: [{ title: 'Size', claims: [RADIUS, { text: 'The Sun has a radius of 0.2 R☉ (Doe et al. 2020).', basis: 'measured' }] }],
  planets: ['testa-b'],
}
const CORRECTED = {
  type: 'answer',
  sections: [{ title: 'Size', claims: [RADIUS, { text: 'Its host star, Testa, has a radius of 0.2 R☉ (Doe et al. 2020).', basis: 'measured' }] }],
  planets: ['testa-b'],
}

function setup(script, limits = {}) {
  const config = testConfig(limits)
  const client = scriptedClient(script)
  const tc = fixtureContext()
  const astronomer = createAstronomer({ config, client, limiter: createLimiter(config.limits), getToolContext: () => tc, log: () => {} })
  return { client, ask: (question) => astronomer.ask({ question, clientKey: 'c1', planetId: 'testa-b' }) }
}

describe('orchestrator: misattributed values never reach the user', () => {
  it('repairs the attribution and shows only the corrected answer', async () => {
    const { ask, client } = setup([json(MISATTRIBUTED), json(CORRECTED)])
    const r = await ask('How does Testa b compare with the Sun?')
    expect(r.status).toBe('answered')
    expect(r.validation.repairs).toBe(1)
    expect(r.sections[0].claims[1].text).toBe('Its host star, Testa, has a radius of 0.2 R☉ (Doe et al. 2020).')
    expect(JSON.stringify(r)).not.toMatch(/The Sun has a radius/)
    expect(client.requests[1].messages.at(-1).content).toMatch(/Correct every misattributed value/)
  })

  it('ends with the fixed safe reply when the repair keeps the wrong object', async () => {
    const { ask } = setup([json(MISATTRIBUTED), json(MISATTRIBUTED), json(MISATTRIBUTED)], { AI_MAX_REPAIR_ATTEMPTS: 2 })
    const r = await ask('How does Testa b compare with the Sun?')
    expect(r.status).toBe('unverified')
    expect(r.sections).toEqual([])
    expect(r.validation.issues).toEqual(['attribution'])
    expect(r.message).toMatch(/a value attributed to the wrong object/)
    expect(JSON.stringify(r)).not.toMatch(/The Sun has a radius|0\.2 R☉/)
  })
})
