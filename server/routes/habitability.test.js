import { describe, expect, it } from 'vitest'
import { quantity } from '../../src/contracts/planet.js'
import { FIXTURE_PLANETS } from '../ai/__fixtures__/planets.js'
import { createApp } from '../app.js'
import { habitabilityDataset, habitabilityRow } from './habitability.js'

const state = (planets) => ({ planets, meta: { retrievedAt: '2026-10-31T00:00:00Z' }, version: 'v1' })

describe('habitability dataset', () => {
  it('counts every planet and lists only placed ones, with canonical values and provenance', () => {
    const d = habitabilityDataset(state(FIXTURE_PLANETS))
    expect(d.count).toBe(FIXTURE_PLANETS.length)
    const placedTotal = Object.values(d.summary.placements).reduce((a, b) => a + b, 0)
    expect(d.planets).toHaveLength(placedTotal)
    expect(Object.values(d.summary.zoneStatus).reduce((a, b) => a + b, 0)).toBe(FIXTURE_PLANETS.length)
    for (const p of d.planets) {
      expect(p.zoneStatus).toBe('placed')
      expect(p.flux.value).toBeGreaterThan(0)
      expect(['measured', 'calculated', 'estimated']).toContain(p.flux.status)
    }
    expect(JSON.stringify(d)).not.toMatch(/imputed|score|probab/i)
  })

  it('never takes a value from an imputed quantity', () => {
    const p = { ...structuredClone(FIXTURE_PLANETS[0]), radiusEarth: quantity(1, 'imputed'), insolationEarth: quantity(1, 'imputed'), massEarth: quantity(1, 'imputed') }
    const row = habitabilityRow(p)
    expect(row.radius).toBeNull()
    expect(row.mass).toBeNull()
    expect(row.flux?.status).not.toBe('imputed') // falls back to luminosity and orbit, labelled calculated
  })
})

describe('GET /api/habitability', () => {
  it('serves the dataset with an ETag per catalogue version', async () => {
    const store = { get: () => state(FIXTURE_PLANETS) }
    const server = createApp({ store }).listen(0)
    try {
      const url = `http://localhost:${server.address().port}/api/habitability`
      const res = await fetch(url)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ generatedAt: '2026-10-31T00:00:00Z', count: FIXTURE_PLANETS.length })
      const again = await fetch(url, { headers: { 'If-None-Match': res.headers.get('etag') } })
      expect(again.status).toBe(304)
    } finally {
      server.close()
    }
  })
})
