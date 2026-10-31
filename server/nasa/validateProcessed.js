// Processed-catalogue validation, fingerprints and change detection — owner:
// DATA (implemented by LEAD in M5 Phase A).
//
// Runs AFTER the raw-row checks in ingest.js (validateCatalog) and BEFORE a
// candidate catalogue may replace the one being served. It checks the
// normalised Planet records themselves, and compares them with the current
// catalogue so a partial or broken NASA response cannot slip through.

import { createHash } from 'node:crypto'

/** Canonical statuses. 'imputed' is deliberately absent (CLAUDE.md §5a). */
export const CANONICAL_STATUSES = new Set(['measured', 'calculated', 'estimated', 'missing'])
export const MASS_KINDS = new Set(['Mass', 'Msini', 'M-R'])

/** Previous planets that must still be present (planets are rarely removed). */
export const MIN_RETENTION = 0.99
/** Largest allowed drop in coverage of a key field, in percentage points. */
export const MAX_COVERAGE_DROP = 5

export const COVERAGE_FIELDS = {
  radiusEarth: (p) => p.radiusEarth,
  massEarth: (p) => p.massEarth,
  periodDays: (p) => p.periodDays,
  eqTempK: (p) => p.eqTempK,
  'star.teff': (p) => p.star?.teff,
  'system.distancePc': (p) => p.system?.distancePc,
}

const isQuantity = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'status' in v && 'value' in v

function* quantities(node, path = '') {
  if (isQuantity(node)) {
    yield [path, node]
    return
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) yield* quantities(v, path ? `${path}.${k}` : k)
  }
}

/** Problem with one Quantity, or null. */
function quantityProblem(q) {
  if (!CANONICAL_STATUSES.has(q.status)) return `status "${q.status}"`
  if (q.status === 'missing') return q.value === null ? null : 'missing with a value'
  if (typeof q.value !== 'number' || !Number.isFinite(q.value)) return 'non-numeric value'
  if (q.err !== undefined && !(Array.isArray(q.err) && q.err.length === 2 && q.err.every(Number.isFinite))) return 'malformed uncertainty'
  if (q.limit !== undefined && q.limit !== '<' && q.limit !== '>') return 'malformed limit'
  if (q.source !== undefined && (typeof q.source?.label !== 'string' || !q.source.label)) return 'malformed source'
  if (q.kind !== undefined && !MASS_KINDS.has(q.kind)) return `mass kind "${q.kind}"`
  return null
}

/** Share (0–100) of planets with a value per key field, plus source coverage. */
export function coverage(planets) {
  const n = planets.length || 1
  const out = {}
  for (const [field, get] of Object.entries(COVERAGE_FIELDS)) out[field] = (planets.filter((p) => get(p)?.value != null).length / n) * 100
  let known = 0
  let sourced = 0
  for (const p of planets) {
    for (const [, q] of quantities(p)) {
      if (q.value == null) continue
      known++
      if (q.source) sourced++
    }
  }
  out.sources = known ? (sourced / known) * 100 : 0
  return out
}

/**
 * @param {object[]} planets  normalised candidate catalogue
 * @param {{ previous?: object[]|null }} [opts]  catalogue currently served
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateProcessed(planets, { previous = null } = {}) {
  const errors = []
  if (!Array.isArray(planets) || planets.length === 0) return { ok: false, errors: ['no planets'] }

  const ids = new Set()
  const names = new Set()
  const problems = new Map() // problem → count
  let firstProblem = null
  for (const p of planets) {
    if (typeof p?.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name || typeof p.host !== 'string' || !p.host) {
      problems.set('planet without id, name or host', (problems.get('planet without id, name or host') ?? 0) + 1)
      continue
    }
    if (ids.has(p.id)) problems.set('duplicate planet id', (problems.get('duplicate planet id') ?? 0) + 1)
    if (names.has(p.name)) problems.set('duplicate planet name', (problems.get('duplicate planet name') ?? 0) + 1)
    ids.add(p.id)
    names.add(p.name)
    for (const [path, q] of quantities(p)) {
      const problem = quantityProblem(q)
      if (problem) {
        const key = `${problem} (e.g. ${p.name} ${path})`
        const group = problem
        problems.set(group, (problems.get(group) ?? 0) + 1)
        firstProblem ??= key
      }
    }
  }
  for (const [problem, count] of problems) errors.push(`${count} × ${problem}`)
  if (firstProblem && errors.length) errors.push(`first: ${firstProblem}`)

  if (previous?.length) {
    const kept = previous.filter((p) => ids.has(p.id)).length
    if (kept / previous.length < MIN_RETENTION) {
      errors.push(`only ${kept} of ${previous.length} current planets are still present (< ${MIN_RETENTION * 100}%)`)
    }
    const before = coverage(previous)
    const after = coverage(planets)
    for (const [field, pct] of Object.entries(after)) {
      if (before[field] - pct > MAX_COVERAGE_DROP) {
        errors.push(`${field} coverage fell from ${before[field].toFixed(1)}% to ${pct.toFixed(1)}%`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

/** JSON with sorted keys: snapshots and fresh records may order keys differently. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/** Content fingerprint of a catalogue (planets only, order-independent). */
export function fingerprint(planets) {
  const h = createHash('sha256')
  for (const p of [...planets].sort((a, b) => (a.id < b.id ? -1 : 1))) h.update(stableStringify(p)).update('\n')
  return h.digest('hex')
}

/**
 * What changed between two catalogues.
 * @returns {{ added: number, removed: number, updated: number, examples: { added: string[], removed: string[], updated: string[] } }}
 */
export function diffCatalogs(previous, next) {
  const before = new Map((previous ?? []).map((p) => [p.id, p]))
  const after = new Map(next.map((p) => [p.id, p]))
  const added = []
  const removed = []
  const updated = []
  for (const [id, p] of after) {
    const old = before.get(id)
    if (!old) added.push(p.name)
    else if (stableStringify(old) !== stableStringify(p)) updated.push(p.name)
  }
  for (const [id, p] of before) if (!after.has(id)) removed.push(p.name)
  const sample = (list) => list.sort().slice(0, 5)
  return { added: added.length, removed: removed.length, updated: updated.length, examples: { added: sample(added), removed: sample(removed), updated: sample(updated) } }
}
