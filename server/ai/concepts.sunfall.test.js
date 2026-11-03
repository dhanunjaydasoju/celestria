import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { labPlanets } from '../../src/three/lab/fixtures.js'
import { CONCEPTS, findConcept, findConceptsIn } from './knowledge/concepts.js'
import { packingClaims, volumeCounts } from './packing.js'
import { createToolContext, runTool } from './tools/index.js'
import { validateAnswer } from './validate.js'

const NEW = ['volume_equivalence', 'sun_mass_share']
const text = (c) => [c.summary, ...c.keyPoints].join(' ')

describe('existing concepts are unchanged', () => {
  it('keeps the 17 original entries byte for byte', () => {
    const original = Object.fromEntries(Object.entries(CONCEPTS).filter(([k]) => !NEW.includes(k)))
    expect(Object.keys(original)).toHaveLength(17)
    // sha256 of the original CONCEPTS before the SUNFALL concepts were added (commit 59596ea).
    expect(createHash('sha256').update(JSON.stringify(original)).digest('hex')).toBe('bc7209ee419152fa4581574372f3f0d40ece339a618d28743c2dd9dd80b70b3d')
  })
})

describe('the new concepts are retrievable', () => {
  it('by key, title and the phrasings the live model used', () => {
    expect(findConcept('volume comparison')).toBe('volume_equivalence') // live Q3 lookup
    expect(findConcept('Solar System mass distribution')).toBe('sun_mass_share') // live Q2/Q4 lookup
    expect(findConcept('Volume equivalence versus sphere packing')).toBe('volume_equivalence')
    expect(findConcept("The Sun's share of Solar System mass")).toBe('sun_mass_share')
    expect(findConcept('sphere packing')).toBe('volume_equivalence')
  })

  it('are pre-retrieved for the three live questions that previously had no reference', () => {
    expect(findConceptsIn('How many TRAPPIST-1 e planets could physically fit inside the Sun?')).toContain('volume_equivalence')
    expect(findConceptsIn('Explain what it means to compare the volume of TRAPPIST-1 e with the Sun.')).toContain('volume_equivalence')
    expect(findConceptsIn("What percentage of the Solar System's mass does the Sun contain, and why?")).toContain('sun_mass_share')
  })

  it('return their references through explain_concept', () => {
    const ctx = createToolContext(labPlanets)
    const v = runTool(ctx, 'explain_concept', { concept: 'volume comparison' }).result
    expect(v).toMatchObject({ status: 'ok', concept: 'volume_equivalence', basis: 'established' })
    expect(v.references.map((r) => r.url)).toEqual([
      'https://mathworld.wolfram.com/Sphere.html',
      'https://mathworld.wolfram.com/KeplerConjecture.html',
      'https://doi.org/10.4007/annals.2005.162.1065',
    ])
    const m = runTool(ctx, 'explain_concept', { concept: 'mass of the solar system' }).result
    expect(m.references).toEqual([{ label: 'NASA Science, "Sun: Facts"', url: 'https://science.nasa.gov/sun/facts/' }])
  })
})

describe('content', () => {
  const vol = CONCEPTS.volume_equivalence
  const mass = CONCEPTS.sun_mass_share

  it('gives the sphere volume formula and the cube rule', () => {
    expect(vol.summary).toContain('V = 4/3 πr³')
    expect(vol.summary).toMatch(/cube of the radius: doubling the radius makes the volume 8 times larger/)
    expect(vol.summary).toContain('(radius of the larger ÷ radius of the smaller)³')
    expect(2 ** 3).toBe(8)
    expect(10 ** 3).toBe(1000) // the 10× radius → 1,000× volume example
  })

  it('separates volume equivalence from physical packing, with the packing limit', () => {
    expect(text(vol)).toMatch(/mathematical volume equivalence, not the number of planets that could physically fit inside the Sun/)
    expect(text(vol)).toMatch(/cannot fill space without gaps/)
    expect(text(vol)).toMatch(/about 74% of the space \(π ÷ \(3√2\) ≈ 0\.7405/)
    expect(Math.PI / (3 * Math.SQRT2)).toBeCloseTo(0.7405, 4)
  })

  it('gives the Sun’s mass share as NASA states it, with approximation wording', () => {
    expect(mass.summary).toMatch(/about 99\.8% of the Solar System's mass \(NASA\)/)
    expect(text(mass)).toMatch(/Mass and volume are different quantities/)
  })

  it('contains no SUNFALL count and no packing claim', () => {
    for (const c of [vol, mass]) {
      expect(text(c)).not.toMatch(/million|billion|1\.3/i)
      expect(volumeCounts(text(c))).toEqual([])
      expect(packingClaims([c.summary, ...c.keyPoints])).toEqual([])
    }
  })

  it('cites only verified sources, with no invented dates or quotations', () => {
    expect(vol.references.map((r) => r.label)).toEqual([
      'Weisstein, "Sphere", MathWorld (Wolfram)',
      'Weisstein, "Kepler Conjecture", MathWorld (Wolfram)',
      'Hales 2005, "A proof of the Kepler conjecture", Annals of Mathematics 162, 1065–1185',
    ])
    for (const r of [...vol.references, ...mass.references]) expect(r.url).toMatch(/^https:\/\//)
  })
})

// ── Validator compatibility (strict mode, as the orchestrator runs it) ─────
const ctx = createToolContext(labPlanets)
const evidence = [
  runTool(ctx, 'get_planet', { name: 'TRAPPIST-1 e' }),
  runTool(ctx, 'explain_concept', { concept: 'volume equivalence' }),
  runTool(ctx, 'explain_concept', { concept: 'solar system mass' }),
]
const validate = (claims) => validateAnswer({ sections: [{ title: 'Answer', claims }], planets: ['trappist-1-e'] }, evidence, { requireReferences: true })
const est = (t) => ({ text: t, basis: 'established' })
const rules = (r) => r.errors.map((e) => e.rule)

describe('answers grounded in the new concepts', () => {
  it('pass when they explain volume equivalence and packing correctly, without a count', () => {
    const r = validate([
      est('The volume of a sphere is 4/3 πr³, so volume grows with the cube of the radius.'),
      est("Doubling a sphere's radius makes its volume 8 times larger."),
      est('SUNFALL is a mathematical volume equivalence, not a count of planets that could physically fit inside the Sun.'),
      est('Identical spheres cannot fill space without gaps; even the densest arrangement fills only about 74% of it.'),
      { text: 'TRAPPIST-1 e has a measured radius of 0.920 +0.013 −0.012 R⊕.', basis: 'measured', refs: ['trappist-1-e'] },
    ])
    expect(r.errors).toEqual([])
  })

  it('pass when they give the Sun’s mass share and why', () => {
    const r = validate([
      est("The Sun accounts for about 99.8% of the Solar System's mass."),
      est('Most of the collapsing solar nebula was pulled towards the centre and formed the Sun.'),
      est('Mass and volume are different quantities.'),
    ])
    expect(r.errors).toEqual([])
  })

  it('still reject packing claims', () => {
    expect(rules(validate([est('About 1.3 million Earths would fit inside the Sun.')]))).toContain('packing')
    expect(rules(validate([est('Even so, many copies of TRAPPIST-1 e could fit inside the Sun.')]))).toContain('packing')
  })

  it('still reject an invented SUNFALL count', () => {
    expect(rules(validate([est('The Sun has about 1.3 million times the volume of TRAPPIST-1 e.')]))).toContain('volume-count')
    expect(rules(validate([est('The Sun has 1672167 times the volume of TRAPPIST-1 e.')]))).toContain('volume-count')
  })

  it('still reject numbers the references do not give', () => {
    expect(rules(validate([est("The Sun accounts for about 99.9% of the Solar System's mass.")]))).toContain('number')
    expect(validate([est('The densest arrangement of spheres fills about 80% of space.')]).ok).toBe(false)
    expect(validate([est('The densest arrangement of spheres fills about 74% of space.')]).ok).toBe(true)
  })

  it('accept a stated percentage only when a reference states it', () => {
    const withoutMass = [evidence[0], evidence[1]]
    const r = validateAnswer({ sections: [{ title: 'Answer', claims: [est("The Sun accounts for about 99.8% of the Solar System's mass.")] }] }, withoutMass, { requireReferences: true })
    expect(r.ok).toBe(false)
  })

  it('keep entity attribution strict', () => {
    expect(rules(validate([{ text: 'The Sun has a radius of 0.1192 R☉.', basis: 'measured' }]))).toContain('attribution')
    expect(rules(validate([{ text: 'TRAPPIST-1 has a radius of 0.1192 R☉.', basis: 'measured' }]))).not.toContain('attribution')
  })

  it('still need the reference: without explain_concept, general claims fail', () => {
    const r = validateAnswer({ sections: [{ title: 'Answer', claims: [est('Volume grows with the cube of the radius.')] }] }, [evidence[0]], { requireReferences: true })
    expect(rules(r)).toContain('reference')
  })
})
