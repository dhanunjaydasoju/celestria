// Refresh the catalogue snapshot from NASA — owner: DATA (LEAD in M4).
// The existing snapshot is replaced only by a complete, validated catalogue.

import { normalizeRow } from '../../src/pipeline/normalize.js'
import { fetchCatalog, validateCatalog } from './ingest.js'
import { readSnapshot, writeSnapshotAtomic } from './snapshot.js'

/**
 * @param {string} snapshotPath
 * @param {{ log?: (m: string) => void, fetchCatalogImpl?: typeof fetchCatalog } & object} [opts]
 * @returns {Promise<{ replaced: boolean, count?: number, bytes?: number, errors?: string[], dataset?: object }>}
 */
export async function refreshSnapshot(snapshotPath, opts = {}) {
  const log = opts.log ?? (() => {})
  const previous = await readSnapshot(snapshotPath).catch(() => null)
  let fetched
  try {
    fetched = await (opts.fetchCatalogImpl ?? fetchCatalog)(opts)
  } catch (err) {
    log(`NASA fetch failed: ${err.message}. Keeping existing snapshot.`)
    return { replaced: false, errors: [err.message] }
  }
  const check = validateCatalog(fetched.rows, { expected: fetched.expected, previousCount: previous?.meta.count ?? null })
  if (!check.ok) {
    log(`Validation failed: ${check.errors.join('; ')}. Keeping existing snapshot.`)
    return { replaced: false, errors: check.errors }
  }
  const planets = fetched.rows.map(normalizeRow).sort((a, b) => a.name.localeCompare(b.name))
  const dataset = {
    meta: {
      source: 'NASA Exoplanet Archive, pscomppars (https://exoplanetarchive.ipac.caltech.edu)',
      retrievedAt: new Date().toISOString(),
      count: planets.length,
      expectedCount: fetched.expected,
      chunks: fetched.chunks.length,
    },
    planets,
  }
  const bytes = await writeSnapshotAtomic(snapshotPath, dataset)
  log(`Snapshot written: ${planets.length} planets, ${(bytes / 1024).toFixed(0)} KB gzipped`)
  return { replaced: true, count: planets.length, bytes, dataset }
}
