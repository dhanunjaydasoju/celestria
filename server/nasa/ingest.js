// NASA catalogue ingestion: chunked TAP fetching and validation — owner: DATA
// (implemented by LEAD in M4).
//
// The catalogue is split by right ascension into chunks of ≤ maxRows, using a
// cheap per-degree count query (the Kepler field holds half the catalogue in
// 30°, so fixed bins would be very uneven). The fetched total must equal
// NASA's own count; otherwise the result is rejected.

import { ALL_COLUMNS, TABLE, TAP_URL } from '../../src/pipeline/nasaColumns.js'
import { isValidRow } from '../../src/pipeline/normalize.js'
import { fetchWithRetry } from './http.js'

export const MIN_CATALOG_SIZE = 4000 // sanity floor; pscomppars held 6,451 in Oct 2026
export const MAX_SHRINK = 0.02 // reject if the catalogue shrinks by more than 2%

/** Run one ADQL query; resolves to the TAP JSON array. */
export async function tapQuery(adql, opts = {}) {
  const url = `${opts.tapUrl ?? TAP_URL}?query=${encodeURIComponent(adql)}&format=json`
  const res = await fetchWithRetry(url, opts)
  const body = await res.json()
  if (!Array.isArray(body)) throw new Error('TAP response is not a JSON array')
  return body
}

/**
 * Pack per-degree counts into contiguous [raMin, raMax) chunks of ≤ maxRows.
 * A single degree larger than maxRows becomes its own chunk.
 * @param {{ deg: number, n: number }[]} bins
 * @returns {{ raMin: number, raMax: number, expected: number }[]}
 */
export function planChunks(bins, maxRows = 600) {
  const sorted = [...bins].filter((b) => b.n > 0).sort((a, b) => a.deg - b.deg)
  const chunks = []
  let cur = null
  for (const b of sorted) {
    if (cur && cur.expected + b.n > maxRows) {
      chunks.push(cur)
      cur = null
    }
    if (!cur) cur = { raMin: b.deg, raMax: b.deg + 1, expected: 0 }
    cur.raMax = b.deg + 1
    cur.expected += b.n
  }
  if (cur) chunks.push(cur)
  return chunks
}

/**
 * Fetch the full catalogue in chunks.
 * @returns {Promise<{ rows: object[], expected: number, chunks: object[] }>}
 */
export async function fetchCatalog(opts = {}) {
  const log = opts.log ?? (() => {})
  const [{ n: expected }] = await tapQuery(`select count(*) as n from ${TABLE}`, opts)
  const [{ n: nullRa }] = await tapQuery(`select count(*) as n from ${TABLE} where ra is null`, opts)
  const bins = await tapQuery(`select floor(ra) as deg, count(*) as n from ${TABLE} where ra is not null group by floor(ra)`, opts)
  const chunks = planChunks(bins, opts.maxRows ?? 600)
  if (nullRa > 0) chunks.push({ raMin: null, raMax: null, expected: nullRa })
  log(`NASA: ${expected} planets in ${chunks.length} chunks`)

  const cols = ALL_COLUMNS.join(',')
  const rows = []
  for (const [i, c] of chunks.entries()) {
    const where = c.raMin == null ? 'ra is null' : `ra >= ${c.raMin} and ra < ${c.raMax}`
    const part = await tapQuery(`select ${cols} from ${TABLE} where ${where}`, opts)
    if (part.length !== c.expected) {
      throw new Error(`Chunk ${i + 1} (${where}) returned ${part.length} rows, expected ${c.expected}`)
    }
    rows.push(...part)
    log(`  chunk ${i + 1}/${chunks.length}: ${part.length} rows`)
  }
  return { rows, expected, chunks }
}

/**
 * Validate a fetched catalogue before it may replace a snapshot.
 * @param {object[]} rows
 * @param {{ expected: number, previousCount?: number|null }} ctx
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCatalog(rows, { expected, previousCount = null }) {
  const errors = []
  if (!Array.isArray(rows)) return { ok: false, errors: ['rows is not an array'] }
  if (rows.length !== expected) errors.push(`fetched ${rows.length} rows but NASA reports ${expected}`)
  if (rows.length < MIN_CATALOG_SIZE) errors.push(`only ${rows.length} rows (minimum ${MIN_CATALOG_SIZE})`)
  if (previousCount && rows.length < previousCount * (1 - MAX_SHRINK)) {
    errors.push(`catalogue shrank from ${previousCount} to ${rows.length} (> ${MAX_SHRINK * 100}%)`)
  }
  const invalid = rows.filter((r) => !isValidRow(r)).length
  if (invalid) errors.push(`${invalid} rows lack a planet name or host`)
  const names = new Set(rows.map((r) => r.pl_name))
  if (names.size !== rows.length) errors.push(`${rows.length - names.size} duplicate planet names`)
  const withPeriod = rows.filter((r) => Number.isFinite(r.pl_orbper)).length
  if (rows.length && withPeriod / rows.length < 0.9) errors.push(`only ${withPeriod} rows have an orbital period`)
  return { ok: errors.length === 0, errors }
}
