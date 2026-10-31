import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeRow } from '../../src/pipeline/normalize.js'
import { createApp } from '../app.js'
import { createCatalogStorage } from '../nasa/catalogStorage.js'
import { createCatalogStore } from '../nasa/catalogStore.js'
import { writeSnapshotAtomic } from '../nasa/snapshot.js'
import { createSyncService } from '../nasa/syncService.js'

const TOKEN = 'test-admin-token-0123456789abcdef'
const rows = (n) => Array.from({ length: n }, (_, i) => ({ pl_name: `P-${i} b`, hostname: `P-${i}`, pl_orbper: 1 + i }))

let dir
let server
let base
let clock
let builds

async function start({ adminToken = TOKEN, build } = {}) {
  dir = mkdtempSync(path.join(tmpdir(), 'celestria-syncapi-'))
  const seedPath = path.join(dir, 'seed.json.gz')
  const planets = rows(5000).map(normalizeRow)
  await writeSnapshotAtomic(seedPath, { meta: { retrievedAt: '2026-10-31T00:00:00Z', count: planets.length }, planets })
  const storage = createCatalogStorage({ seedPath, runtimeDir: path.join(dir, 'runtime') })
  const store = createCatalogStore({ storage })
  await store.load()
  clock = Date.parse('2026-10-31T12:00:00Z')
  builds = 0
  const sync = createSyncService({
    store,
    storage,
    now: () => clock,
    buildCandidateImpl: async () => (builds++, build ? build() : { ok: false, stage: 'fetch', errors: ['NASA unavailable'] }),
    options: { startupDelayMs: 1e9, tickMs: 1e9 },
  })
  await sync.start()
  server = createApp({ store, sync: { sync, adminToken } }).listen(0)
  base = `http://localhost:${server.address().port}/api`
  return sync
}
afterEach(() => {
  server?.close()
  rmSync(dir, { recursive: true, force: true })
})
const post = (p, headers = {}) => fetch(`${base}${p}`, { method: 'POST', headers })

describe('GET /api/sync/status', () => {
  beforeEach(() => start())
  it('reports catalogue, last success vs last attempt, changes, schedule and errors', async () => {
    const res = await fetch(`${base}/sync/status`)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const s = await res.json()
    expect(s.catalog).toEqual({ count: 5000, retrievedAt: '2026-10-31T00:00:00Z', origin: 'seed' })
    expect(s.sync).toMatchObject({ enabled: true, running: false, lastSuccessAt: null, lastAttemptAt: null, lastChanges: null, lastError: null, intervalHours: 24 })
    expect(s.sync.nextScheduledAt).toBe('2026-11-01T00:00:00.000Z')
    expect(JSON.stringify(s)).not.toContain(TOKEN)
  })
})

describe('POST /api/sync/check (anonymous)', () => {
  beforeEach(() => start())
  it('starts one sync, then enforces a global cooldown for everyone', async () => {
    const first = await post('/sync/check')
    expect(first.status).toBe(202)
    expect((await first.json()).accepted).toBe(true)
    await new Promise((r) => setTimeout(r, 20))
    const second = await post('/sync/check')
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('retry-after'))).toBe(900)
    const body = await second.json()
    expect(body.error.code).toBe('SYNC_COOLDOWN')
    expect(body.status.sync).toMatchObject({ lastAttemptResult: 'failed', lastSuccessAt: null, lastError: { message: 'NASA unavailable' } })
    expect(builds).toBe(1)
  })

  it('limits how often one client may call it', async () => {
    const codes = []
    for (let i = 0; i < 7; i++) codes.push((await post('/sync/check')).status)
    expect(codes.slice(0, 5).every((c) => c === 202 || c === 429)).toBe(true)
    const last = await post('/sync/check')
    expect(last.status).toBe(429)
    expect((await last.json()).error.code).toBe('RATE_LIMITED')
    expect(builds).toBe(1)
  })
})

describe('POST /api/sync/refresh (admin)', () => {
  it('is hidden when no admin token is configured', async () => {
    await start({ adminToken: null })
    expect((await post('/sync/refresh', { Authorization: `Bearer ${TOKEN}` })).status).toBe(404)
  })

  it('ignores tokens that are too short', async () => {
    await start({ adminToken: 'short' })
    expect((await post('/sync/refresh', { Authorization: 'Bearer short' })).status).toBe(404)
  })

  it('rejects wrong tokens, locks out repeated failures, and never echoes the token', async () => {
    await start()
    const wrong = await post('/sync/refresh', { Authorization: 'Bearer nope-nope-nope-nope-nope-nope' })
    expect(wrong.status).toBe(401)
    expect(await wrong.text()).not.toContain(TOKEN)
    for (let i = 0; i < 4; i++) await post('/sync/refresh', { Authorization: 'Bearer wrong' })
    expect((await post('/sync/refresh', { Authorization: `Bearer ${TOKEN}` })).status).toBe(429) // locked even with the right token
    expect(builds).toBe(0)
  })

  it('runs a forced sync with the right token and can wait for the result', async () => {
    const planets = rows(5002)
    await start({ build: async () => ({ ok: true, dataset: { meta: { retrievedAt: '2026-10-31T12:00:00Z', count: 5002 }, planets: planets.map(normalizeRow) } }) })
    const res = await post('/sync/refresh?wait=1', { Authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ accepted: true, result: 'updated', status: { catalog: { count: 5002, origin: 'live' }, sync: { lastChanges: { added: 2 } } } })
    expect(JSON.stringify(body)).not.toContain(TOKEN)
  })
})
