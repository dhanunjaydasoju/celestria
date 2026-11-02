// Compare page helpers — owner: UI (implemented by LEAD, Stage 2b). Pure:
// URL selection, value display and row explanations for the comparison
// built by src/science/compare.js.

import { formatMeasurement } from '../../components/data/formatMeasurement.js'
import { MAX_COMPARE_PLANETS, interval } from '../../science/compare.js'

const ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/

/**
 * Planet ids from the `ids` query value ("a,b,c"): trimmed, lower-cased,
 * de-duplicated, order kept. Malformed entries are dropped.
 * @param {string|null} value
 */
export function parseIds(value) {
  if (!value) return []
  const out = []
  for (const part of value.split(',')) {
    const id = part.trim().toLowerCase()
    if (ID_RE.test(id) && !out.includes(id)) out.push(id)
    if (out.length >= 20) break
  }
  return out
}

/**
 * Split requested ids into those compared (known, first four), unknown ones
 * and known ones beyond the limit. Earth is never part of this list.
 * @param {string[]} requested
 * @param {Record<string, object>} byId
 */
export function resolveSelection(requested, byId) {
  const known = requested.filter((id) => byId[id])
  return {
    ids: known.slice(0, MAX_COMPARE_PLANETS),
    unknown: requested.filter((id) => !byId[id]),
    overflow: known.slice(MAX_COMPARE_PLANETS),
  }
}

/**
 * Search string ("?ids=a,b&earth=0") with `ids` set, or removed when empty;
 * other params kept. Commas stay readable (ids never contain one).
 * @param {URLSearchParams} params
 * @param {string[]} ids
 * @param {Record<string, string|null>} [extra]  params to set (null removes)
 */
export function searchWith(params, ids, extra = {}) {
  const next = new URLSearchParams(params)
  if (ids) {
    if (ids.length) next.set('ids', ids.join(','))
    else next.delete('ids')
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v == null) next.delete(k)
    else next.set(k, v)
  }
  const s = next.toString().replace(/%2C/gi, ',')
  return s ? `?${s}` : ''
}

const plain = (n) => {
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return n.toExponential()
  return n.toLocaleString('en-US', { maximumFractionDigits: 12 })
}

const shownNumber = (text) => Number(text.replace(/,/g, ''))

/**
 * Display text for a quantity cell.
 * - With a known uncertainty: rounded to the precision the uncertainty
 *   supports (the profile's convention).
 * - Catalogue value without uncertainty: shown exactly as catalogued.
 * - CELESTRIA-calculated value without uncertainty: 4 significant figures.
 * `exact` holds the full value whenever the shown number differs from it,
 * so no rounding is silent.
 * @param {{ value: number|null, err?: [number, number]|null }} cell
 * @param {{ derived?: boolean }} [opts]
 * @returns {{ value: string, plus?: string, minus?: string, symmetric?: boolean, exact: string|null }|null}
 */
export function formatCell(cell, { derived = false } = {}) {
  if (cell?.value == null || !Number.isFinite(cell.value)) return null
  const f = interval(cell) ? formatMeasurement(cell.value, cell.err) : derived ? formatMeasurement(cell.value) : { value: plain(cell.value) }
  return { ...f, exact: shownNumber(f.value) === cell.value ? null : plain(cell.value) }
}

/** Fields whose unit is not already Earth- or Sun-relative get a "× Earth" line. */
export const RATIO_ROWS = new Set(['densityGcc', 'surfaceGravity', 'periodDays'])

/** "≈ 2.00 × Earth" (3 significant figures; the ratio is calculated). */
export function ratioText(ratio) {
  if (!ratio || !Number.isFinite(ratio.value)) return null
  return `≈ ${formatMeasurement(ratio.value, undefined, { maxSig: 3 }).value} × ${ratio.against}`
}

const WORDS = {
  radiusEarth: ['Largest', 'Smallest'],
  massEarth: ['Most massive', 'Least massive'],
  densityGcc: ['Densest', 'Least dense'],
  surfaceGravity: ['Strongest', 'Weakest'],
  eqTempK: ['Hottest', 'Coolest'],
  insolationEarth: ['Most starlight', 'Least starlight'],
  periodDays: ['Longest', 'Shortest'],
  semiMajorAxisAU: ['Widest', 'Tightest'],
  periastron: ['Farthest', 'Closest'],
  apoastron: ['Farthest', 'Closest'],
  'star.teff': ['Hottest', 'Coolest'],
  'star.massSun': ['Most massive', 'Least massive'],
  'star.radiusSun': ['Largest', 'Smallest'],
  'star.lumLog': ['Brightest', 'Faintest'],
  'star.ageGyr': ['Oldest', 'Youngest'],
  distancePc: ['Farthest', 'Nearest'],
}

/** Words for the highlighted extremes of a row. */
export function highlightWords(key) {
  return WORDS[key] ?? ['Highest', 'Lowest']
}

/** Which cell, if any, is highlighted: only extremes the module marks `distinct`. */
export function highlightOf(ranking, planetId) {
  if (ranking?.status !== 'ranked') return null
  if (ranking.highest.planetId === planetId && ranking.highest.separation === 'distinct') return 'high'
  if (ranking.lowest.planetId === planetId && ranking.lowest.separation === 'distinct') return 'low'
  return null
}

const WHY = {
  overlap: 'values overlap within their uncertainties',
  unverified: 'not every value has a reported uncertainty',
}

/**
 * One short explanation per row (never per cell), or null when the row
 * needs none: text rows, a single planet, or both extremes clearly distinct.
 * @param {{ type: string, ranking?: object }} row
 */
export function rowNote(row) {
  const r = row.ranking
  if (row.type !== 'quantity' || !r || r.status === 'insufficient') return null
  if (r.status === 'notRanked') return r.reason
  const hi = r.highest.separation
  const lo = r.lowest.separation
  const est = r.basis === 'estimated' ? ' Compared among model-based estimates only.' : ''
  if (hi === 'distinct' && lo === 'distinct') return est.trim() || null
  if (hi === lo) return `Not highlighted: ${WHY[hi]}.${est}`
  const [clear, unclear, why] = hi === 'distinct' ? ['highest', 'lowest', WHY[lo]] : lo === 'distinct' ? ['lowest', 'highest', WHY[hi]] : [null, null, null]
  if (!clear) return `Not highlighted: ${WHY.overlap}, and ${WHY.unverified}.${est}`
  return `Only the ${clear} value is highlighted; the ${unclear} is not, because ${why}.${est}`
}

/** Row explanation for values CELESTRIA calculates (shown once in the label). */
export const DERIVED_BASIS = {
  surfaceGravity: 'Calculated: g = G·M/R², only from a measured true mass and a measured radius',
  periastron: 'Calculated: a(1 − e), only when the eccentricity was measured',
  apoastron: 'Calculated: a(1 + e), only when the eccentricity was measured',
}

/**
 * Citations per planet with the fields that use them, from the cells.
 * @param {{ groups: { rows: { type: string, label: string, cells: object[] }[] }[] }} comparison
 * @param {{ id: string, name: string }[]} planets
 */
export function sourcesByPlanet(comparison, planets) {
  return planets.map((p, i) => {
    const map = new Map()
    for (const g of comparison.groups) {
      for (const row of g.rows) {
        const src = row.type === 'quantity' ? row.cells[i]?.source : null
        if (!src?.label) continue
        const key = `${src.label}|${src.url ?? ''}`
        if (!map.has(key)) map.set(key, { ...src, fields: [] })
        const label = row.label[0].toLowerCase() + row.label.slice(1)
        map.get(key).fields.push(g.key === 'star' ? `star ${label}` : label)
      }
    }
    return { id: p.id, name: p.name, sources: [...map.values()] }
  })
}
