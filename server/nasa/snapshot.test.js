import { describe, expect, it } from 'vitest'
import lab from '../../src/three/lab/fixtures.json'
import { readSnapshot } from './snapshot.js'

// The committed snapshot must stay structurally valid and contain every
// regression planet. Values may change when it is deliberately refreshed.
describe('committed catalogue snapshot', async () => {
  const snap = await readSnapshot('server/data/catalog.snapshot.json.gz')

  it('is complete and uniquely keyed', () => {
    expect(snap.meta.count).toBe(snap.planets.length)
    expect(snap.meta.count).toBe(snap.meta.expectedCount)
    expect(snap.planets.length).toBeGreaterThan(4000)
    expect(new Set(snap.planets.map((p) => p.id)).size).toBe(snap.planets.length)
  })

  it('contains all 41 regression planets', () => {
    const ids = new Set(snap.planets.map((p) => p.id))
    for (const p of lab.planets) expect(ids.has(p.id), p.id).toBe(true)
  })

  it('keeps missing values as null with status "missing" and never stores imputed values', () => {
    const qs = snap.planets.flatMap((p) => [p.radiusEarth, p.massEarth, p.eqTempK, p.eccentricity, p.star.teff, p.star.ageGyr])
    for (const q of qs) {
      expect(q.status).not.toBe('imputed')
      if (q.status === 'missing') expect(q.value).toBeNull()
      else expect(Number.isFinite(q.value)).toBe(true)
    }
  })
})
