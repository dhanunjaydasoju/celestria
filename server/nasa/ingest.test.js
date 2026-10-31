import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import raw from '../../src/pipeline/__fixtures__/raw-41.json'
import { normalizeRow } from '../../src/pipeline/normalize.js'
import { HttpError, fetchWithRetry } from './http.js'
import { fetchCatalog, planChunks, validateCatalog } from './ingest.js'
import { refreshSnapshot } from './refresh.js'
import { decodeSnapshot, encodeSnapshot, readSnapshot, writeSnapshotAtomic } from './snapshot.js'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = (status) => ({ ok: false, status, json: async () => ({}) })
const noSleep = () => Promise.resolve()

/** Synthetic catalogue rows (above the size floor) for validation tests. */
const rows = (n) => Array.from({ length: n }, (_, i) => ({ pl_name: `P-${i} b`, hostname: `P-${i}`, pl_orbper: 1 + i }))

describe('fetchWithRetry', () => {
  it('retries 5xx with exponentially growing delays, then succeeds', async () => {
    const responses = [fail(503), fail(502), ok([1])]
    const delays = []
    const res = await fetchWithRetry('x', {
      fetchImpl: async () => responses.shift(),
      sleepImpl: async (ms) => delays.push(ms),
      baseDelayMs: 100,
    })
    expect(await res.json()).toEqual([1])
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBeGreaterThanOrEqual(50)
    expect(delays[0]).toBeLessThanOrEqual(100)
    expect(delays[1]).toBeGreaterThanOrEqual(100)
    expect(delays[1]).toBeLessThanOrEqual(200)
  })

  it('does not retry client errors (except 429)', async () => {
    let calls = 0
    await expect(fetchWithRetry('x', { fetchImpl: async () => (calls++, fail(400)), sleepImpl: noSleep })).rejects.toMatchObject({ status: 400 })
    expect(calls).toBe(1)
    calls = 0
    await expect(fetchWithRetry('x', { fetchImpl: async () => (calls++, fail(429)), sleepImpl: noSleep, retries: 2 })).rejects.toBeInstanceOf(HttpError)
    expect(calls).toBe(3)
  })

  it('times out hung requests and retries them', async () => {
    let calls = 0
    const hang = (_url, { signal }) =>
      new Promise((resolve, reject) => {
        calls++
        if (calls === 2) return resolve(ok(['done']))
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    const res = await fetchWithRetry('x', { fetchImpl: hang, timeoutMs: 20, sleepImpl: noSleep })
    expect(await res.json()).toEqual(['done'])
    expect(calls).toBe(2)
  })

  it('gives up after the retry budget', async () => {
    let calls = 0
    await expect(fetchWithRetry('x', { fetchImpl: async () => (calls++, fail(500)), retries: 3, sleepImpl: noSleep })).rejects.toThrow('HTTP 500')
    expect(calls).toBe(4)
  })
})

describe('planChunks', () => {
  it('covers every row in contiguous chunks of at most maxRows', () => {
    const bins = Array.from({ length: 360 }, (_, deg) => ({ deg, n: deg >= 280 && deg < 300 ? 150 : 8 }))
    const chunks = planChunks(bins, 600)
    expect(chunks.reduce((s, c) => s + c.expected, 0)).toBe(bins.reduce((s, b) => s + b.n, 0))
    for (const c of chunks) expect(c.expected).toBeLessThanOrEqual(600)
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].raMin).toBeGreaterThanOrEqual(chunks[i - 1].raMax)
  })

  it('gives an oversized single degree its own chunk', () => {
    expect(planChunks([{ deg: 290, n: 900 }], 600)).toEqual([{ raMin: 290, raMax: 291, expected: 900 }])
  })
})

describe('fetchCatalog', () => {
  it('rejects a chunk whose row count differs from the plan', async () => {
    const answers = [[{ n: 3 }], [{ n: 0 }], [{ deg: 10, n: 3 }], [{ pl_name: 'a', hostname: 'A' }]]
    await expect(fetchCatalog({ fetchImpl: async () => ok(answers.shift()), sleepImpl: noSleep })).rejects.toThrow(/returned 1 rows, expected 3/)
  })
})

describe('validateCatalog', () => {
  it('accepts a complete catalogue', () => {
    expect(validateCatalog(rows(5000), { expected: 5000, previousCount: 4990 })).toEqual({ ok: true, errors: [] })
  })

  it('rejects incomplete, shrunken, duplicated or malformed catalogues', () => {
    expect(validateCatalog(rows(5000), { expected: 5100 }).ok).toBe(false)
    expect(validateCatalog(rows(4500), { expected: 4500, previousCount: 6451 }).errors.join()).toMatch(/shrank/)
    const dup = rows(5000)
    dup[1].pl_name = dup[0].pl_name
    expect(validateCatalog(dup, { expected: 5000 }).errors.join()).toMatch(/duplicate/)
    const bad = rows(5000)
    bad[3].hostname = ''
    expect(validateCatalog(bad, { expected: 5000 }).errors.join()).toMatch(/lack a planet name or host/)
    expect(validateCatalog(rows(100), { expected: 100 }).errors.join()).toMatch(/minimum/)
  })
})

describe('snapshot', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'celestria-snap-'))
  afterEach(() => {})
  const planets = raw.rows.map(normalizeRow)

  it('round-trips planets exactly and stores each source once', () => {
    const enc = encodeSnapshot({ meta: { count: planets.length }, planets })
    const labels = enc.sources.map((s) => `${s.label}|${s.url}`)
    expect(new Set(labels).size).toBe(labels.length)
    expect(decodeSnapshot(JSON.parse(JSON.stringify(enc))).planets).toEqual(planets)
  })

  it('never replaces a good snapshot with a failed or invalid fetch', async () => {
    const file = path.join(dir, 'catalog.snapshot.json.gz')
    const good = rows(5000).map(normalizeRow)
    await writeSnapshotAtomic(file, { meta: { count: good.length }, planets: good })
    const before = readFileSync(file)

    const failed = await refreshSnapshot(file, { fetchCatalogImpl: async () => { throw new Error('NASA down') } })
    expect(failed.replaced).toBe(false)
    expect(readFileSync(file).equals(before)).toBe(true)

    const incomplete = await refreshSnapshot(file, { fetchCatalogImpl: async () => ({ rows: rows(4800), expected: 5000, chunks: [] }) })
    expect(incomplete.replaced).toBe(false)
    expect(readFileSync(file).equals(before)).toBe(true)

    const complete = await refreshSnapshot(file, { fetchCatalogImpl: async () => ({ rows: rows(5050), expected: 5050, chunks: [{}] }) })
    expect(complete.replaced).toBe(true)
    expect((await readSnapshot(file)).meta.count).toBe(5050)
    rmSync(dir, { recursive: true, force: true })
  })
})
