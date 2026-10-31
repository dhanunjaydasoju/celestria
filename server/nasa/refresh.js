// Build and validate a catalogue from NASA — owner: DATA (LEAD in M4; M5 Phase A).
// A candidate passes both the raw-row checks (ingest.js) and the processed-
// record checks (validateProcessed.js) or it is rejected. Nothing here
// replaces the catalogue being served; callers decide what to do with it.

import { normalizeRow } from '../../src/pipeline/normalize.js'
import { fetchCatalog, validateCatalog } from './ingest.js'
import { readSnapshot, writeSnapshotAtomic } from './snapshot.js'
import { validateProcessed } from './validateProcessed.js'

export const SOURCE = 'NASA Exoplanet Archive, pscomppars (https://exoplanetarchive.ipac.caltech.edu)'

/**
 * @param {{ previous?: object[]|null, fetchCatalogImpl?: typeof fetchCatalog, log?: (m: string) => void } & object} [opts]
 * @returns {Promise<{ ok: true, dataset: object } | { ok: false, stage: 'fetch'|'raw'|'processed', errors: string[] }>}
 */
export async function buildCandidate(opts = {}) {
  const log = opts.log ?? (() => {})
  let fetched
  try {
    fetched = await (opts.fetchCatalogImpl ?? fetchCatalog)(opts)
  } catch (err) {
    return { ok: false, stage: 'fetch', errors: [err.message] }
  }
  const raw = validateCatalog(fetched.rows, { expected: fetched.expected, previousCount: opts.previous?.length ?? null })
  if (!raw.ok) return { ok: false, stage: 'raw', errors: raw.errors }
  const planets = fetched.rows.map(normalizeRow).sort((a, b) => a.name.localeCompare(b.name))
  const processed = validateProcessed(planets, { previous: opts.previous ?? null })
  if (!processed.ok) return { ok: false, stage: 'processed', errors: processed.errors }
  log(`NASA catalogue validated: ${planets.length} planets`)
  return {
    ok: true,
    dataset: {
      meta: { source: SOURCE, retrievedAt: new Date().toISOString(), count: planets.length, expectedCount: fetched.expected, chunks: fetched.chunks.length },
      planets,
    },
  }
}

/**
 * Developer tool (npm run data:snapshot): rebuild the committed seed snapshot.
 * The running server never calls this; it syncs into its runtime folder.
 * @param {string} snapshotPath
 */
export async function refreshSnapshot(snapshotPath, opts = {}) {
  const log = opts.log ?? (() => {})
  const previous = await readSnapshot(snapshotPath).catch(() => null)
  const result = await buildCandidate({ ...opts, previous: previous?.planets ?? null })
  if (!result.ok) {
    log(`${result.stage === 'fetch' ? 'NASA fetch failed' : 'Validation failed'}: ${result.errors.join('; ')}. Keeping existing snapshot.`)
    return { replaced: false, errors: result.errors }
  }
  const bytes = await writeSnapshotAtomic(snapshotPath, result.dataset)
  log(`Snapshot written: ${result.dataset.planets.length} planets, ${(bytes / 1024).toFixed(0)} KB gzipped`)
  return { replaced: true, count: result.dataset.planets.length, bytes, dataset: result.dataset }
}
