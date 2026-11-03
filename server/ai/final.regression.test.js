// Regression tests for the final AI wording and reliability fixes (after the
// third live evaluation): classification wording, "perfect packing", concept
// coverage, and the provider's capacity error in the logs.
import { describe, expect, it } from 'vitest'
import { labPlanets } from '../../src/three/lab/fixtures.js'
import { ANSWER_TESTA_B, json, scriptedClient, testConfig, fixtureContext } from './__fixtures__/fakeProvider.js'
import { ProviderError, createFeatherlessClient } from './featherless.js'
import { CONCEPTS } from './knowledge/concepts.js'
import { createLimiter } from './limits.js'
import { createAstronomer } from './orchestrator.js'
import { packingMisnomers } from './packing.js'
import { systemPrompt } from './prompts.js'
import { createToolContext, runTool } from './tools/index.js'
import { validateAnswer } from './validate.js'

const ctx = createToolContext(labPlanets)
const planet = runTool(ctx, 'get_planet', { name: 'TRAPPIST-1 e' })
const volume = runTool(ctx, 'explain_concept', { concept: 'volume equivalence' })
const mass = runTool(ctx, 'explain_concept', { concept: 'solar system mass' })
const validate = (claims, evidence) => validateAnswer({ sections: [{ title: 'Answer', claims }], planets: ['trappist-1-e'] }, evidence, { requireReferences: true })
const rules = (r) => r.errors.map((e) => e.rule)
const est = (text) => ({ text, basis: 'established' })
const RADIUS = { text: 'TRAPPIST-1 e has a measured radius of 0.920 +0.013 −0.012 R⊕.', basis: 'measured', refs: ['trappist-1-e'] }

describe('classification wording: the size class comes from radius alone', () => {
  it('the tool states it, with the right thresholds, and keeps the temperature band separate', () => {
    expect(planet.result.type.basis).toBe('Size class "Rocky world" from radius alone (below 1.6, 1.6–4, 4–8, 8+ R⊕). The temperature band "Temperate" is a separate label, from equilibrium temperature.')
    const massOnly = { ...labPlanets.find((p) => p.name === 'TRAPPIST-1 e'), id: 'mass-only', name: 'Mass-only b', radiusEarth: { value: null, status: 'missing' } }
    const r = runTool(createToolContext([massOnly]), 'get_planet', { name: 'Mass-only b' }).result
    expect(r.type.basis).toMatch(/^Size class "Rocky world" from mass alone, because no radius is known \(below 2, 2–10, 10–50, 50\+ M⊕\)\./)
  })

  it('rejects the live Q1 wording', () => {
    const r = validate([RADIUS, { text: 'TRAPPIST-1 e is classified as a rocky world based on its size and temperature.', basis: 'classification' }], [planet])
    expect(rules(r)).toContain('classification')
  })

  it('accepts correct wording', () => {
    for (const text of [
      'TRAPPIST-1 e is in the rocky world size class, from its radius.',
      'TRAPPIST-1 e is classified as a rocky world by size and as temperate by its equilibrium temperature.',
    ]) {
      expect(validate([RADIUS, { text, basis: 'classification' }], [planet]).errors).toEqual([])
    }
  })
})

describe('"perfect packing" is not how a volume equivalence works', () => {
  it('rejects the live Q3 wording and its variants', () => {
    expect(packingMisnomers('A volume equivalence calculation (like SUNFALL) does not represent how many planets could physically fit inside the Sun, as it ignores gaps between objects and assumes perfect packing.')).toHaveLength(1)
    expect(packingMisnomers('SUNFALL treats the planets as perfectly packed.')).toHaveLength(1)
    expect(packingMisnomers('The count assumes ideal packing of the spheres.')).toHaveLength(1)
    const r = validate(
      [RADIUS, est('A volume equivalence calculation (like SUNFALL) does not represent how many planets could physically fit inside the Sun, as it ignores gaps between objects and assumes perfect packing.')],
      [planet, volume],
    )
    expect(rules(r)).toContain('packing')
  })

  it('allows negated and correct wording', () => {
    expect(packingMisnomers('SUNFALL does not assume perfect packing.')).toEqual([])
    expect(packingMisnomers('It compares volumes without assuming any packing.')).toEqual([])
    expect(packingMisnomers('SUNFALL compares mathematical volumes without modelling physical arrangement or packing gaps.')).toEqual([])
  })

  it('the concept uses the requested wording and never says "perfect packing"', () => {
    const text = [CONCEPTS.volume_equivalence.summary, ...CONCEPTS.volume_equivalence.keyPoints].join(' ')
    expect(text).toContain('SUNFALL compares mathematical volumes without modelling physical arrangement or packing gaps.')
    expect(text).not.toMatch(/perfect(ly)? pack/i)
  })
})

describe('concept coverage', () => {
  it('the prompt asks for the reference’s key points and distinctions', () => {
    const p = systemPrompt()
    expect(p).toMatch(/include each of its key points that the question asks about/)
    expect(p).toMatch(/a volume equivalence is not physical packing and that packed spheres always leave gaps/)
    expect(p).toMatch(/quote the densest-packing figure only as the reference gives it/)
    expect(p).toMatch(/its share, why the Sun dominates, and that mass is not volume/)
    expect(p).toMatch(/size class comes from radius alone/)
  })

  it('a complete Q2 answer validates: equivalence, gaps and the 74% figure, no count', () => {
    const r = validate(
      [
        RADIUS,
        est('SUNFALL compares mathematical volumes; it is not a count of planets that could physically fit inside the Sun.'),
        est('Packed spheres always leave gaps: even the densest arrangement of identical spheres fills only about 74% of space.'),
        est('Volume grows with the cube of the radius.'),
      ],
      [planet, volume],
    )
    expect(r.errors).toEqual([])
  })

  it('a complete Q4 answer validates: share, why, and mass versus volume', () => {
    const r = validate(
      [
        est("The Sun accounts for about 99.8% of the Solar System's mass."),
        est('Most of the collapsing solar nebula was pulled towards the centre and formed the Sun.'),
        est('Mass and volume are different quantities: mass is the amount of matter, volume is the space a body occupies.'),
      ],
      [mass, planet], // the helper lists TRAPPIST-1 e as a referenced planet
    )
    expect(r.errors).toEqual([])
  })

  it('safeguards are unchanged: counts, packing, misattribution and wrong figures still fail', () => {
    expect(rules(validate([est('About 1.3 million Earths would fit inside the Sun.')], [planet, volume]))).toContain('packing')
    expect(rules(validate([est('The Sun has 1.3 million times the volume of TRAPPIST-1 e.')], [planet, volume]))).toContain('volume-count')
    expect(rules(validate([{ text: 'The Sun has a radius of 0.1192 R☉.', basis: 'measured' }], [planet]))).toContain('attribution')
    expect(validate([est('The densest arrangement fills about 80% of space.')], [planet, volume]).ok).toBe(false)
  })
})

describe('provider capacity errors are logged with the provider’s code', () => {
  it('the client keeps Featherless’ error code from an HTTP 200 error body', async () => {
    const body = JSON.stringify({ error: { message: 'Qwen/Qwen3-32B is temporarily at capacity. Please try again shortly.', type: 'server_error', code: 'capacity_exhausted' } })
    const config = { baseUrl: 'https://x.test', authHeaders: () => ({}), redact: (s) => s }
    const client = createFeatherlessClient(config, { fetch: async () => new Response(body, { status: 200 }) })
    const err = await client.chat({ model: 'm', messages: [], maxTokens: 10, timeoutMs: 1000 }).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toMatchObject({ code: 'provider_error', retryable: true, status: 200, providerCode: 'capacity_exhausted' })
  })

  it('ignores provider codes that are not plain identifiers', () => {
    expect(new ProviderError('provider_error', 'x', { providerCode: 'bad code <script>' }).providerCode).toBeNull()
  })

  it('the orchestrator falls back and logs the code, not the message', async () => {
    const config = testConfig()
    const capacity = () => {
      throw new ProviderError('provider_error', 'Provider error: at capacity', { retryable: true, status: 200, providerCode: 'capacity_exhausted' })
    }
    const logs = []
    const tc = fixtureContext()
    const astronomer = createAstronomer({ config, client: scriptedClient([capacity, json(ANSWER_TESTA_B)]), limiter: createLimiter(config.limits), getToolContext: () => tc, log: (e) => logs.push(e) })
    const r = await astronomer.ask({ question: 'Tell me about Testa b', clientKey: 'c' })
    expect(r).toMatchObject({ status: 'answered', fallbackUsed: true })
    const ask = logs.find((e) => e.event === 'ask')
    expect(ask.providerErrors).toEqual([{ model: config.model, code: 'provider_error', providerCode: 'capacity_exhausted' }])
    expect(JSON.stringify(ask)).not.toContain('at capacity')
  })
})
