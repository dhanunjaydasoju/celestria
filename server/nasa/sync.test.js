import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import raw from '../../src/pipeline/__fixtures__/raw-41.json'
import { normalizeRow } from '../../src/pipeline/normalize.js'
import { createCatalogStorage } from './catalogStorage.js'
import { createCatalogStore } from './catalogStore.js'
import { buildCandidate } from './refresh.js'
import { readSnapshot, writeSnapshotAtomic } from './snapshot.js'
import { DAY, HOUR, createSyncService } from './syncService.js'
import { coverage, diffCatalogs, fingerprint, stableStringify, validateProcessed } from './validateProcessed.js'

/** Synthetic rows above the catalogue size floor (as in ingest.test.js). */
const rows = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ pl_name: `P-${i} b`, hostname: `P-${i}`, pl_orbper: 1 + i, pl_rade: 1 + (i % 7), pl_rade_reflink: '<a href=https://x.org/a target=ref>Doe et al. 2020</a>', ...extra(i) }))
const planetsOf = (r) => r.map(normalizeRow).sort((a, b) => a.name.localeCompare(b.name))
const dataset = (planets, retrievedAt) => ({ meta: { source: 'NASA', retrievedAt, count: planets.length }, planets })
const fetched = (r) => async () => ({ rows: r, expected: r.length, chunks: [{}] })

let dir
let seedPath
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'celestria-sync-'))
  seedPath = path.join(dir, 'seed.json.gz')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('validateProcessed', () => {
  const good = planetsOf(raw.rows)

  it('accepts real normalised NASA records', () => {
    expect(validateProcessed(good)).toEqual({ ok: true, errors: [] })
  })

  it('rejects imputed, malformed or duplicated records', () => {
    const imputed = structuredClone(good)
    imputed[0].eqTempK = { value: 300, status: 'imputed' }
    expect(validateProcessed(imputed).errors.join()).toMatch(/status "imputed"/)
    const badErr = structuredClone(good)
    badErr[1].radiusEarth = { ...badErr[1].radiusEarth, err: [0.1] }
    expect(validateProcessed(badErr).errors.join()).toMatch(/malformed uncertainty/)
    const missingWithValue = structuredClone(good)
    missingWithValue[2].massEarth = { value: 3, status: 'missing' }
    expect(validateProcessed(missingWithValue).errors.join()).toMatch(/missing with a value/)
    const dup = structuredClone(good)
    dup[3].id = dup[4].id
    expect(validateProcessed(dup).errors.join()).toMatch(/duplicate planet id/)
    const noSource = structuredClone(good)
    noSource[5].radiusEarth = { ...noSource[5].radiusEarth, source: { url: 'x' } }
    expect(validateProcessed(noSource).errors.join()).toMatch(/malformed source/)
  })

  it('rejects candidates that lose planets or field coverage compared with the current catalogue', () => {
    const current = planetsOf(rows(5000))
    expect(validateProcessed(planetsOf(rows(5000)).slice(0, 4900), { previous: current }).errors.join()).toMatch(/still present/)
    const noRadius = planetsOf(rows(5000, (i) => (i % 5 === 0 ? { pl_rade: null } : {})))
    expect(validateProcessed(noRadius, { previous: current }).errors.join()).toMatch(/radiusEarth coverage fell/)
    const noSources = planetsOf(rows(5000, () => ({ pl_rade_reflink: null })))
    expect(validateProcessed(noSources, { previous: current }).errors.join()).toMatch(/sources coverage fell/)
    expect(coverage(current).radiusEarth).toBe(100)
  })

  it('fingerprints content independently of key order and reports changes', () => {
    const a = planetsOf(raw.rows)
    const reordered = a.map((p) => JSON.parse(stableStringify(p)))
    expect(fingerprint(reordered)).toBe(fingerprint(a))
    const b = structuredClone(a)
    b[0].radiusEarth = { ...b[0].radiusEarth, value: b[0].radiusEarth.value + 0.01 }
    b.push(normalizeRow({ pl_name: 'New-1 b', hostname: 'New-1', pl_orbper: 3 }))
    const d = diffCatalogs(a, b.slice(1))
    expect(d).toMatchObject({ added: 1, removed: 1, updated: 0 })
    expect(diffCatalogs(a, b)).toMatchObject({ added: 1, removed: 0, updated: 1, examples: { added: ['New-1 b'] } })
  })
})

describe('buildCandidate', () => {
  it('requires raw and processed validation before returning a catalogue', async () => {
    expect(await buildCandidate({ fetchCatalogImpl: async () => { throw new Error('NASA down') } })).toMatchObject({ ok: false, stage: 'fetch' })
    expect(await buildCandidate({ fetchCatalogImpl: async () => ({ rows: rows(4800), expected: 5000, chunks: [] }) })).toMatchObject({ ok: false, stage: 'raw' })
    const previous = planetsOf(rows(5000))
    const lostRadii = rows(5000, (i) => (i % 4 === 0 ? { pl_rade: null } : {}))
    expect(await buildCandidate({ previous, fetchCatalogImpl: fetched(lostRadii) })).toMatchObject({ ok: false, stage: 'processed' })
    const ok = await buildCandidate({ previous, fetchCatalogImpl: fetched(rows(5010)) })
    expect(ok.ok).toBe(true)
    expect(ok.dataset.planets).toHaveLength(5010)
  })

  it('keeps NASA values, uncertainties, limits and references exactly as normalised', async () => {
    const r = await buildCandidate({ fetchCatalogImpl: fetched([...raw.rows, ...rows(4000)]) })
    const trappist = r.dataset.planets.find((p) => p.name === 'TRAPPIST-1 e')
    expect(trappist).toEqual(normalizeRow(raw.rows.find((x) => x.pl_name === 'TRAPPIST-1 e')))
    expect(trappist.radiusEarth).toMatchObject({ value: 0.92, err: [0.013, -0.012], status: 'measured', source: { label: 'Agol et al. 2021' } })
  })
})

describe('catalogue storage', () => {
  it('never writes the seed; promotes via verified candidate and keeps a backup', async () => {
    await writeSnapshotAtomic(seedPath, dataset(planetsOf(rows(5000)), '2026-10-01T00:00:00Z'))
    const seedBytes = readFileSync(seedPath)
    const storage = createCatalogStorage({ seedPath, runtimeDir: path.join(dir, 'runtime') })
    expect((await storage.loadBest()).origin).toBe('seed')

    await storage.promote(dataset(planetsOf(rows(5001)), '2026-10-02T00:00:00Z'))
    expect((await readSnapshot(storage.paths.previous)).planets).toHaveLength(5000) // backup = the seed's data on first sync
    await storage.promote(dataset(planetsOf(rows(5002)), '2026-10-03T00:00:00Z'))
    expect((await readSnapshot(storage.paths.previous)).planets).toHaveLength(5001)
    expect((await readSnapshot(storage.paths.current)).planets).toHaveLength(5002)
    expect(readFileSync(seedPath).equals(seedBytes)).toBe(true)
    expect(existsSync(storage.paths.candidate)).toBe(false)
    expect((await storage.loadBest())).toMatchObject({ origin: 'runtime' })
  })

  it('falls back to the backup, then the seed, when files are corrupt', async () => {
    await writeSnapshotAtomic(seedPath, dataset(planetsOf(rows(5000)), '2026-10-01T00:00:00Z'))
    const storage = createCatalogStorage({ seedPath, runtimeDir: path.join(dir, 'runtime') })
    await storage.promote(dataset(planetsOf(rows(5001)), '2026-10-02T00:00:00Z'))
    await storage.promote(dataset(planetsOf(rows(5002)), '2026-10-03T00:00:00Z'))
    writeFileSync(storage.paths.current, 'not gzip')
    const backup = await storage.loadBest()
    expect(backup.origin).toBe('backup')
    expect(backup.dataset.planets).toHaveLength(5001)
    expect(backup.rejected.map((r) => r.origin)).toContain('runtime')
    writeFileSync(storage.paths.previous, 'also broken')
    expect((await storage.loadBest()).origin).toBe('seed')
  })

  it('ignores runtime files that fail processed validation (e.g. an imputed value)', async () => {
    await writeSnapshotAtomic(seedPath, dataset(planetsOf(rows(5000)), '2026-10-01T00:00:00Z'))
    const runtimeDir = path.join(dir, 'runtime')
    const storage = createCatalogStorage({ seedPath, runtimeDir })
    const tampered = planetsOf(rows(5000))
    tampered[0].eqTempK = { value: 300, status: 'imputed' }
    mkdirSync(runtimeDir, { recursive: true })
    await writeSnapshotAtomic(storage.paths.current, dataset(tampered, '2026-10-05T00:00:00Z'))
    expect((await storage.loadBest()).origin).toBe('seed')
  })
})

describe('sync service', () => {
  let clock
  const setup = async ({ build, seed = rows(5000), retrievedAt = '2026-10-31T00:00:00Z', promoteFail = false } = {}) => {
    await writeSnapshotAtomic(seedPath, dataset(planetsOf(seed), retrievedAt))
    const storage = createCatalogStorage({ seedPath, runtimeDir: path.join(dir, 'runtime') })
    if (promoteFail) storage.promote = async () => { throw new Error('disk full') }
    const store = createCatalogStore({ storage })
    await store.load()
    clock = Date.parse('2026-10-31T12:00:00Z')
    const calls = []
    const buildCandidateImpl = async (opts) => {
      calls.push(opts)
      return build(opts)
    }
    const sync = createSyncService({ store, storage, buildCandidateImpl, now: () => clock, options: { startupDelayMs: 10_000_000, tickMs: 10_000_000 } })
    return { sync, store, storage, calls, seedBytes: readFileSync(seedPath) }
  }
  afterEach(() => {})

  it('applies a validated update, records changes, and keeps the seed untouched', async () => {
    const next = rows(5003)
    const { sync, store, seedBytes } = await setup({ build: () => buildCandidate({ fetchCatalogImpl: fetched(next) }) })
    const before = store.get()
    const { promise } = sync.run('admin')
    const out = await promise
    expect(out.result).toBe('updated')
    expect(store.get().planets).toHaveLength(5003)
    expect(store.get().origin).toBe('live')
    expect(before.planets).toHaveLength(5000) // in-flight requests keep their state object
    const s = sync.status().sync
    expect(s).toMatchObject({ lastAttemptResult: 'updated', lastChanges: { added: 3, removed: 0 }, lastError: null, consecutiveFailures: 0 })
    expect(s.lastSuccessAt).toBe(s.lastAttemptAt)
    expect(readFileSync(seedPath).equals(seedBytes)).toBe(true)
  })

  it('records an unchanged check as a success without rewriting files', async () => {
    const { sync, store, storage } = await setup({ build: async () => ({ ok: true, dataset: dataset(planetsOf(rows(5000)), '2026-10-31T12:00:00Z') }) })
    const out = await sync.run('scheduled').promise
    expect(out.result).toBe('unchanged')
    expect(existsSync(storage.paths.current)).toBe(false)
    expect(store.get().origin).toBe('seed')
    expect(sync.status().sync.lastSuccessAt).toBeTruthy()
  })

  it('keeps serving the last valid catalogue when NASA fails or data is rejected', async () => {
    let attempt = 0
    const { sync, store } = await setup({
      build: async () => (++attempt === 1 ? { ok: false, stage: 'fetch', errors: ['HTTP 525'] } : { ok: false, stage: 'processed', errors: ['radiusEarth coverage fell'] }),
    })
    const served = store.get()
    expect((await sync.run('scheduled').promise).result).toBe('failed')
    expect(store.get()).toBe(served)
    let s = sync.status().sync
    expect(s).toMatchObject({ lastSuccessAt: null, lastAttemptResult: 'failed', lastError: { stage: 'fetch', message: 'HTTP 525' }, consecutiveFailures: 1 })
    clock += HOUR + 1
    expect((await sync.run('scheduled').promise).result).toBe('rejected')
    s = sync.status().sync
    expect(s.lastError).toMatchObject({ stage: 'processed' })
    expect(store.get()).toBe(served)
  })

  it('keeps serving when the new catalogue cannot be saved', async () => {
    const { sync, store } = await setup({ build: () => buildCandidate({ fetchCatalogImpl: fetched(rows(5003)) }), promoteFail: true })
    expect((await sync.run('admin').promise).result).toBe('failed')
    expect(store.get().planets).toHaveLength(5000)
    expect(sync.status().sync.lastError).toMatchObject({ stage: 'store', message: 'disk full' })
  })

  it('never runs two syncs at once', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    const { sync, calls } = await setup({ build: async () => (await gate, { ok: false, stage: 'fetch', errors: ['x'] }) })
    const a = sync.run('scheduled')
    const b = sync.run('admin')
    const c = sync.requestCheck()
    clock += 2 * DAY
    const d = sync.tick()
    expect([a.started, b.started, d.started]).toEqual([true, false, false])
    expect(c).toMatchObject({ accepted: true, reason: 'already_running' })
    expect(b.promise).toBe(a.promise)
    expect(sync.status().sync.running).toBe(true)
    release()
    await a.promise
    expect(calls).toHaveLength(1)
    expect(sync.status().sync.running).toBe(false)
  })

  it('schedules every 24 h and backs off after failures', async () => {
    let ok = false
    const { sync, calls } = await setup({ build: async () => (ok ? { ok: true, dataset: dataset(planetsOf(rows(5000)), 'x') } : { ok: false, stage: 'fetch', errors: ['down'] }) })
    await sync.start()
    expect(sync.tick().started).toBe(false) // data retrieved 12 h ago: not due
    clock = Date.parse('2026-11-01T00:00:01Z') // 24 h after retrieval
    await sync.tick().promise
    expect(calls).toHaveLength(1)
    expect(sync.status().sync.nextScheduledAt).toBe(new Date(clock + HOUR).toISOString()) // backoff 1 h
    clock += HOUR + 1
    await sync.tick().promise
    expect(sync.status().sync.nextScheduledAt).toBe(new Date(clock + 2 * HOUR).toISOString()) // then 2 h
    ok = true
    clock += 2 * HOUR + 1
    await sync.tick().promise
    expect(sync.status().sync.nextScheduledAt).toBe(new Date(clock + DAY).toISOString()) // back to daily
    expect(calls).toHaveLength(3)
    sync.stop()
  })

  it('applies cooldowns to anonymous checks and admin refreshes', async () => {
    const { sync } = await setup({ build: async () => ({ ok: false, stage: 'fetch', errors: ['down'] }) })
    const first = sync.requestCheck()
    expect(first.accepted).toBe(true)
    await first.promise
    expect(sync.requestCheck()).toMatchObject({ accepted: false, reason: 'cooldown', retryAfterS: 900 })
    clock += 61_000
    expect(sync.requestAdminRefresh().accepted).toBe(true) // admin: 1 min guard only
  })

  it('persists history across restarts', async () => {
    const { sync, store, storage } = await setup({ build: async () => ({ ok: false, stage: 'fetch', errors: ['down'] }) })
    await sync.run('scheduled').promise
    const again = createSyncService({ store, storage, buildCandidateImpl: async () => ({ ok: false }), now: () => clock, options: { startupDelayMs: 1e9, tickMs: 1e9 } })
    await again.start()
    expect(again.status().sync).toMatchObject({ lastAttemptResult: 'failed', consecutiveFailures: 1, lastError: { message: 'down' } })
    again.stop()
  })
})
