import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import raw from '../../src/pipeline/__fixtures__/raw-41.json'
import { normalizeRow } from '../../src/pipeline/normalize.js'
import { createApp } from '../app.js'
import { createCatalogStore } from '../nasa/catalogStore.js'
import { writeSnapshotAtomic } from '../nasa/snapshot.js'

let server
let base
const dir = mkdtempSync(path.join(tmpdir(), 'celestria-api-'))

beforeAll(async () => {
  const file = path.join(dir, 'snap.json.gz')
  const planets = raw.rows.map(normalizeRow)
  await writeSnapshotAtomic(file, { meta: { retrievedAt: '2026-10-31T00:00:00Z', count: planets.length, expectedCount: planets.length }, planets })
  const store = createCatalogStore({ snapshotPath: file })
  await store.load()
  server = createApp({ store }).listen(0)
  base = `http://localhost:${server.address().port}/api`
})

afterAll(() => {
  server?.close()
  rmSync(dir, { recursive: true, force: true })
})

const hasKey = (node, key) =>
  node && typeof node === 'object' && (Object.hasOwn(node, key) || Object.values(node).some((v) => hasKey(v, key)))

describe('catalogue API', () => {
  it('reports health with the data origin', async () => {
    const h = await (await fetch(`${base}/health`)).json()
    expect(h).toEqual({ ok: true, catalog: { count: 41, generatedAt: '2026-10-31T00:00:00Z', source: 'snapshot' } })
  })

  it('serves the index without per-value sources or uncertainties, gzipped on request', async () => {
    const res = await fetch(`${base}/catalog`, { headers: { 'Accept-Encoding': 'gzip' } })
    expect(res.status).toBe(200)
    const body = await res.json() // fetch decompresses transparently
    expect(body.count).toBe(41)
    expect(hasKey(body.planets, 'source')).toBe(false)
    expect(hasKey(body.planets, 'err')).toBe(false)
    expect(body.planets.find((p) => p.id === 'trappist-1-e').radiusEarth).toMatchObject({ value: 0.92, status: 'measured' })
  })

  it('actually compresses (raw socket check) and supports ETag revalidation', async () => {
    const { request } = await import('node:http')
    const { headers, buf } = await new Promise((resolve, reject) => {
      request(`${base}/catalog`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ headers: res.headers, buf: Buffer.concat(chunks) }))
      })
        .on('error', reject)
        .end()
    })
    expect(headers['content-encoding']).toBe('gzip')
    expect(JSON.parse(gunzipSync(buf)).count).toBe(41)
    const again = await fetch(`${base}/catalog`, { headers: { 'If-None-Match': headers.etag } })
    expect(again.status).toBe(304)
  })

  it('serves full planet details with sources, plus its system', async () => {
    const { planet, system } = await (await fetch(`${base}/planets/hd-80606-b`)).json()
    expect(planet.periodDays.source.label).toBeTruthy()
    expect(planet.periodDays.err).toHaveLength(2)
    expect(system.map((p) => p.id)).toEqual(['hd-80606-b'])
    const trappist = await (await fetch(`${base}/systems/TRAPPIST-1`)).json()
    expect(trappist.planets).toHaveLength(7)
  })

  it('serves coverage and medians, and keeps imputations out of planet records', async () => {
    const stats = await (await fetch(`${base}/stats`)).json()
    expect(stats.coverage.eccentricity.present + stats.coverage.eccentricity.missing).toBe(41)
    expect(stats.medians.massEarth.global.n).toBeGreaterThan(0)
    const { planet } = await (await fetch(`${base}/planets/hr-8799-b`)).json()
    expect(planet.eccentricity).toEqual({ value: null, status: 'missing' })
    const layer = await (await fetch(`${base}/analysis/imputations`)).json()
    expect(layer.policy).toMatch(/analysis only/)
    for (const entries of Object.values(layer.imputations)) {
      for (const e of Object.values(entries)) expect(['median', 'calculated']).toContain(e.method)
    }
  })

  it('returns JSON errors for unknown planets, systems and routes', async () => {
    for (const url of [`${base}/planets/nope`, `${base}/systems/Nowhere`, `${base}/unknown`]) {
      const res = await fetch(url)
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('NOT_FOUND')
    }
  })
})
