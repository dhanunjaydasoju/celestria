import { describe, expect, it } from 'vitest'
import { claimSegments, errorCopy } from './answerFormat.js'
import { derivePageContext, suggestQuestions } from './astronomerContext.js'
import { progressSteps } from './progress.js'

const q = (value, status = 'measured') => ({ value, status })
const missing = { value: null, status: 'missing' }
const byId = {
  'testa-b': { id: 'testa-b', name: 'Testa b', host: 'Testa', radiusEarth: q(1.1), massEarth: q(1.3), eccentricity: q(0.1), periodDays: q(10.5), semiMajorAxisAU: q(0.05), transitMidJD: q(2459000.5), discovery: { method: 'Transit' } },
  'testa-c': { id: 'testa-c', name: 'Testa c', host: 'Testa', radiusEarth: missing, massEarth: missing, eccentricity: missing, periodDays: q(30), semiMajorAxisAU: missing, transitMidJD: missing, discovery: { method: 'Radial Velocity' } },
  'solo-b': { id: 'solo-b', name: 'Solo b', host: 'Solo', radiusEarth: q(2.5), massEarth: missing, discovery: { method: 'Imaging' } },
}
const hosts = { Testa: ['testa-b', 'testa-c'], Solo: ['solo-b'] }

describe('derivePageContext', () => {
  it('reads the planet from profile, viewport and orbit routes', () => {
    expect(derivePageContext({ pathname: '/planet/testa-b', byId })).toEqual({ page: 'planet', planetId: 'testa-b', label: 'Profile · Testa b' })
    expect(derivePageContext({ pathname: '/viewport/testa-b', byId })).toMatchObject({ page: 'viewport', planetId: 'testa-b' })
    expect(derivePageContext({ pathname: '/planet/testa-b/orbit', byId })).toMatchObject({ page: 'orbit', planetId: 'testa-b', label: 'Orbital Simulator · Testa b' })
  })

  it('uses the System View focus (shown system, selected planet)', () => {
    expect(derivePageContext({ pathname: '/explore/Testa', byId })).toEqual({ page: 'system', host: 'Testa', label: 'System View · Testa' })
    expect(derivePageContext({ pathname: '/explore', byId, pageFocus: { host: 'Testa', planetId: 'testa-c' } })).toMatchObject({ planetId: 'testa-c', host: 'Testa', label: 'System View · Testa c' })
  })

  it('passes the compare list and ignores unknown ids', () => {
    expect(derivePageContext({ pathname: '/compare', byId, compareIds: ['testa-b', 'nope', 'solo-b'] })).toMatchObject({ page: 'compare', compareIds: ['testa-b', 'solo-b'] })
    expect(derivePageContext({ pathname: '/planet/kepler-999-z', byId })).toEqual({ page: 'general', label: null })
    expect(derivePageContext({ pathname: '/about', byId })).toEqual({ page: 'general', label: null })
  })
})

describe('suggestQuestions', () => {
  it('fits the page and only asks about values the catalogue has', () => {
    const rich = suggestQuestions({ page: 'orbit', planetId: 'testa-b' }, { byId, hosts })
    expect(rich).toEqual(['How eccentric is the orbit of Testa b?', 'How long is a year on Testa b?', 'When is the next transit of Testa b?', 'How far is Testa b from its star at its closest and farthest?'])
    const sparse = suggestQuestions({ page: 'orbit', planetId: 'testa-c' }, { byId, hosts })
    expect(sparse).toEqual(['What is known about the orbit of Testa c?', 'How long is a year on Testa c?'])
    expect(suggestQuestions({ page: 'planet', planetId: 'testa-c' }, { byId, hosts })).not.toContain('How does Testa c compare with Earth?')
  })

  it('offers system, compare and general questions', () => {
    expect(suggestQuestions({ page: 'system', host: 'Solo' }, { byId, hosts })).not.toContain('Which planet around Solo is the largest?')
    expect(suggestQuestions({ page: 'compare', compareIds: ['testa-b', 'solo-b'] }, { byId, hosts })[0]).toBe('Compare Testa b and Solo b.')
    expect(suggestQuestions({ page: 'compare', compareIds: ['testa-b', 'testa-c', 'solo-b'] }, { byId, hosts })[0]).toBe('Compare Testa b, Testa c and Solo b.')
    expect(suggestQuestions({ page: 'general' }, { byId, hosts })).toHaveLength(4)
  })

  it('never contains numbers (suggestions are questions, not data)', () => {
    for (const ctx of [{ page: 'planet', planetId: 'testa-b' }, { page: 'orbit', planetId: 'testa-b' }, { page: 'system', host: 'Testa' }, { page: 'general' }]) {
      for (const s of suggestQuestions(ctx, { byId, hosts })) expect(s.replace(/Testa|Solo|M sin i/g, '')).not.toMatch(/\d/)
    }
  })
})

describe('progressSteps: honest progress', () => {
  const ev = (stage, extra = {}) => ({ stage, ...extra })

  it('shows only reported stages; the latest stays active until something else arrives', () => {
    const steps = progressSteps([ev('admitted'), ev('retrieved', { tools: [{ label: 'NASA record: Testa b' }] }), ev('model', { model: 'Qwen/Qwen3-32B', purpose: 'draft' })], 'pending')
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'active'])
    expect(steps[2]).toMatchObject({ label: 'Model drafting an answer', detail: 'Qwen3-32B' })
    expect(progressSteps([], 'pending')).toEqual([])
  })

  it('marks a check that led to a repair as failed, and the repair reasons', () => {
    const steps = progressSteps([ev('model'), ev('validating'), ev('repair', { attempt: 1, of: 2, issues: ['number'] }), ev('model', { purpose: 'repair' })], 'pending')
    expect(steps.map((s) => s.state)).toEqual(['done', 'failed', 'done', 'active'])
    expect(steps[2].detail).toBe('Found a number not in the NASA data · attempt 1 of 2')
    expect(steps[3].label).toBe('Model revising its answer')
  })

  it('marks the final check failed when the answer was withheld, and stops on errors', () => {
    expect(progressSteps([ev('model'), ev('validating')], 'done', 'unverified').at(-1).state).toBe('failed')
    expect(progressSteps([ev('model'), ev('validating')], 'done', 'answered').at(-1).state).toBe('done')
    expect(progressSteps([ev('model')], 'error').at(-1).state).toBe('stopped')
  })

  it('never shows percentages or predicted times', () => {
    const steps = progressSteps([ev('queued', { position: 2 }), ev('admitted'), ev('fallback', { from: 'a/Qwen3-32B', to: 'a/Qwen3-14B', reason: 'timeout' }), ev('tools', { tools: [{ label: 'Catalogue search' }] }), ev('validating')], 'pending')
    expect(JSON.stringify(steps)).not.toMatch(/%|\bremaining\b|seconds left|\beta\b/i)
    expect(steps[0].detail).toMatch(/position 2/)
  })
})

describe('claimSegments', () => {
  it('links only URLs returned with the answer', () => {
    const allowed = new Set(['/planet/testa-b', 'https://ui.adsabs.harvard.edu/abs/x'])
    expect(claimSegments('See [Testa b](/planet/testa-b) and [evil](https://evil.example).', allowed)).toEqual([
      { text: 'See ' },
      { text: 'Testa b', href: '/planet/testa-b', internal: true },
      { text: ' and ' },
      { text: 'evil' },
      { text: '.' },
    ])
  })
})

describe('errorCopy', () => {
  it('explains each failure and when retrying makes sense', () => {
    expect(errorCopy({ code: 'RATE_LIMITED', retryAfterS: 30, at: 0 }, 10_000)).toMatchObject({ retry: true, waitS: 20 })
    expect(errorCopy({ code: 'BUDGET_EXHAUSTED' }).retry).toBe(false)
    expect(errorCopy({ code: 'AI_UNAVAILABLE' }).retry).toBe(false)
    expect(errorCopy({ code: 'TIMEOUT' })).toMatchObject({ retry: true, title: 'No verified answer in time' })
    expect(errorCopy({ code: 'SOMETHING_NEW' }).title).toBe('Something went wrong')
  })
})
