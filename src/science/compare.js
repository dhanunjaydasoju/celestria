// Planet comparison model — owner: LEAD (Stage 2a). Pure and deterministic:
// the same planets in the same order always give the same comparison.
//
// Turns 1–4 Planets into grouped rows of cells for the Compare page. Rules
// (CLAUDE.md §1, §5a):
// - Only scientific values are used: imputed values read as missing.
// - Every cell keeps its value, uncertainty, limit, provenance, mass kind and
//   source. Missing values stay null and carry a reason; they are never 0.
// - A row is ranked only when every planet has a comparable value of the same
//   kind of evidence. Limits, assumed values, minimum masses (M sin i) and
//   mixes of model estimates with measurements are never ranked.
// - "Highest"/"lowest" is claimed only when its uncertainty range clears every
//   other planet's (see separation()). Unknown uncertainties never count as
//   a clear difference.
// - Earth/Sun appear only as labelled reference values (earthReference.js).
//   They are never ranked against the planets.
//
// The AI astronomer has its own comparison tool (compare_planets, server side).
// This module is for the UI and does not replace or feed it.

import { isScientific } from '../contracts/planet.js'
import { isFixedCircular, isModelBasedImaging, orbitalExtremes, surfaceGravity } from './derived.js'
import { EARTH_REFERENCE, earthReferenceValue } from './earthReference.js'

export const MAX_COMPARE_PLANETS = 4

/**
 * Comparison fields by group. type 'quantity' rows hold Quantities; 'text'
 * rows hold plain catalogue facts and are never ranked.
 * ratio: the cell gets a value ÷ Earth (or Sun) reference ratio.
 * modelBased: mass/radius-type fields that come from evolutionary models
 * for directly imaged planets.
 */
export const COMPARE_GROUPS = Object.freeze([
  {
    key: 'basics',
    label: 'Planet basics',
    fields: [
      { key: 'name', type: 'text', label: 'Planet', get: (p) => p.name },
      { key: 'host', type: 'text', label: 'Host star', get: (p) => p.host },
      { key: 'flags.controversial', type: 'text', label: 'Flagged as controversial by NASA', get: (p) => p.flags?.controversial ?? null },
    ],
  },
  {
    key: 'physical',
    label: 'Physical properties',
    fields: [
      { key: 'radiusEarth', type: 'quantity', label: 'Radius', unit: 'R⊕', get: (p) => p.radiusEarth, ratio: true, modelBased: true },
      { key: 'massEarth', type: 'quantity', label: 'Mass', unit: 'M⊕', get: (p) => p.massEarth, ratio: true, modelBased: true },
      { key: 'densityGcc', type: 'quantity', label: 'Density', unit: 'g/cm³', get: (p) => p.densityGcc, ratio: true, modelBased: true },
      {
        key: 'surfaceGravity',
        type: 'quantity',
        label: 'Surface gravity',
        unit: 'm/s²',
        get: (p) => surfaceGravity(p),
        derived: true,
        ratio: true,
        missingReason: (p) =>
          isModelBasedImaging(p)
            ? 'Mass and radius of a directly imaged planet come from evolutionary models'
            : 'Requires a measured true mass and a measured radius',
      },
      { key: 'eqTempK', type: 'quantity', label: 'Equilibrium temperature', unit: 'K', get: (p) => p.eqTempK },
      { key: 'insolationEarth', type: 'quantity', label: 'Insolation', unit: 'S⊕', get: (p) => p.insolationEarth, ratio: true },
    ],
  },
  {
    key: 'orbital',
    label: 'Orbital properties',
    fields: [
      { key: 'periodDays', type: 'quantity', label: 'Orbital period', unit: 'days', get: (p) => p.periodDays, ratio: true },
      { key: 'semiMajorAxisAU', type: 'quantity', label: 'Semi-major axis', unit: 'AU', get: (p) => p.semiMajorAxisAU, ratio: true },
      { key: 'eccentricity', type: 'quantity', label: 'Eccentricity', unit: '', get: (p) => p.eccentricity },
      { key: 'inclinationDeg', type: 'quantity', label: 'Inclination', unit: '°', get: (p) => p.inclinationDeg },
      {
        key: 'periastron',
        type: 'quantity',
        label: 'Closest distance to star (periastron)',
        unit: 'AU',
        get: (p) => orbitalExtremes(p)?.periastron ?? null,
        derived: true,
        missingReason: extremesReason,
      },
      {
        key: 'apoastron',
        type: 'quantity',
        label: 'Farthest distance from star (apoastron)',
        unit: 'AU',
        get: (p) => orbitalExtremes(p)?.apoastron ?? null,
        derived: true,
        missingReason: extremesReason,
      },
    ],
  },
  {
    key: 'star',
    label: 'Host star',
    fields: [
      { key: 'star.name', type: 'text', label: 'Name', get: (p) => p.star?.name ?? null },
      { key: 'star.spectralType', type: 'text', label: 'Spectral type', get: (p) => p.star?.spectralType ?? null },
      { key: 'star.teff', type: 'quantity', label: 'Effective temperature', unit: 'K', get: (p) => p.star?.teff },
      { key: 'star.massSun', type: 'quantity', label: 'Mass', unit: 'M☉', get: (p) => p.star?.massSun, ratio: true },
      { key: 'star.radiusSun', type: 'quantity', label: 'Radius', unit: 'R☉', get: (p) => p.star?.radiusSun, ratio: true },
      { key: 'star.lumLog', type: 'quantity', label: 'Luminosity', unit: 'log L/L☉', get: (p) => p.star?.lumLog },
      { key: 'star.metallicity', type: 'quantity', label: 'Metallicity', unit: '[Fe/H] dex', get: (p) => p.star?.metallicity },
      { key: 'star.ageGyr', type: 'quantity', label: 'Age', unit: 'Gyr', get: (p) => p.star?.ageGyr },
    ],
  },
  {
    key: 'discovery',
    label: 'Discovery and system',
    fields: [
      { key: 'discovery.year', type: 'text', label: 'Discovery year', get: (p) => p.discovery?.year ?? null },
      { key: 'discovery.method', type: 'text', label: 'Discovery method', get: (p) => p.discovery?.method ?? null },
      { key: 'discovery.facility', type: 'text', label: 'Facility', get: (p) => p.discovery?.facility ?? null },
      { key: 'discovery.telescope', type: 'text', label: 'Instrument', get: (p) => p.discovery?.telescope ?? null },
      { key: 'distancePc', type: 'quantity', label: 'Distance from Earth', unit: 'pc', get: (p) => p.system?.distancePc },
      { key: 'system.planetCount', type: 'text', label: 'Known planets in system', get: (p) => p.system?.planetCount ?? null },
      { key: 'system.starCount', type: 'text', label: 'Stars in system', get: (p) => p.system?.starCount ?? null },
    ],
  },
])

function extremesReason(p) {
  if (isFixedCircular(p.eccentricity)) return 'Eccentricity was fixed at 0 in the source fit, so this would only restate the assumption'
  if (!isScientific(p.eccentricity)) return 'Requires a catalogue eccentricity'
  return 'Requires a catalogue semi-major axis'
}

export const COMPARE_NOTES = Object.freeze([
  "Values come from the NASA Exoplanet Archive's Planetary Systems Composite Parameters table, which can combine results from different publications for one planet.",
  'Earth and Sun values are reference values from NASA fact sheets and IAU nominal constants, not catalogue measurements. They are never ranked against the planets.',
  'Ratios to Earth (or the Sun) are calculated by CELESTRIA from catalogue values; the reference values have no uncertainty, so a ratio keeps the value’s relative uncertainty.',
  'A highest or lowest value is marked only when every planet has a comparable value and its uncertainty range does not overlap any other planet’s.',
])

const MISSING_REASON = 'Not available in the NASA Exoplanet Archive'
const LIMIT_WORD = { '<': 'an upper limit', '>': 'a lower limit' }

/**
 * Uncertainty interval [low, high] of a cell, or null when the uncertainty
 * is not known. err is [+upper, −lower]; signs are normalised. Both sides
 * must be finite and not both zero (a reported ±0 says nothing).
 * @param {{ value: number|null, err?: [number, number]|null }} cell
 * @returns {[number, number]|null}
 */
export function interval(cell) {
  if (cell?.value == null || !Array.isArray(cell.err)) return null
  const up = Math.abs(cell.err[0])
  const down = Math.abs(cell.err[1])
  if (!Number.isFinite(up) || !Number.isFinite(down) || (up === 0 && down === 0)) return null
  return [cell.value - down, cell.value + up]
}

/**
 * Evidence class used to decide what can be ranked together:
 * 'direct' (measured or calculated from measurements), 'estimated'
 * (model-based) or 'minimum' (M sin i).
 */
function evidenceOf(kind, modelBased) {
  if (kind === 'minimum') return 'minimum'
  if (kind === 'estimated' || modelBased) return 'estimated'
  return 'direct'
}

/**
 * One planet's value for one quantity field.
 * @param {import('../contracts/planet.js').Planet} planet
 * @param {(typeof COMPARE_GROUPS)[number]['fields'][number]} field
 */
export function compareCell(planet, field) {
  const q = field.get(planet)
  if (!isScientific(q)) {
    const reason = q?.status === 'imputed' || !field.missingReason ? MISSING_REASON : field.missingReason(planet)
    return Object.freeze({ planetId: planet.id, value: null, err: null, kind: 'missing', status: 'missing', evidence: null, rankable: false, reason, earthRatio: null })
  }

  const massKind = field.key === 'massEarth' ? (q.kind ?? null) : null
  const assumed = field.key === 'eccentricity' && isFixedCircular(q)
  const kind =
    massKind === 'Msini'
      ? 'minimum'
      : massKind === 'M-R' || q.status === 'estimated'
        ? 'estimated'
        : assumed
          ? 'assumed'
          : q.status === 'calculated'
            ? 'calculated'
            : 'measured'
  const modelBased = Boolean(field.modelBased && isModelBasedImaging(planet))
  const limit = q.limit ?? null

  let reason = null
  if (limit) reason = `Only ${LIMIT_WORD[limit] ?? 'a limit'} is known`
  else if (assumed) reason = 'Fixed at 0 (circular orbit) in the source fit; not measured'

  const cell = {
    planetId: planet.id,
    value: q.value,
    err: Array.isArray(q.err) ? [q.err[0], q.err[1]] : null,
    kind,
    status: q.status,
    evidence: evidenceOf(kind, modelBased),
    rankable: !limit && !assumed,
    reason,
    earthRatio: null,
  }
  if (limit) cell.limit = limit
  if (massKind) cell.massKind = massKind
  if (modelBased) cell.modelBased = true
  if (q.source) cell.source = q.source
  if (q.basis) cell.basis = q.basis
  cell.earthRatio = field.ratio ? earthRatio(cell, field) : null
  return Object.freeze(cell)
}

/**
 * value ÷ Earth (or Sun) reference, status 'calculated'. Uncertainty scales
 * by the same factor (the reference is exact). None for limits, assumed or
 * missing values.
 */
function earthRatio(cell, field) {
  const ref = earthReferenceValue(field.key)
  if (!ref || !(ref.value > 0) || cell.value == null || cell.limit || cell.kind === 'assumed') return null
  const against = field.key.startsWith('star.') ? EARTH_REFERENCE.host : EARTH_REFERENCE.name
  const out = {
    value: cell.value / ref.value,
    status: 'calculated',
    against,
    basis: `${field.label} ÷ ${against}'s ${ref.value} ${ref.unit}`.trim(),
  }
  if (cell.err) out.err = [cell.err[0] / ref.value, cell.err[1] / ref.value]
  if (cell.kind === 'minimum') out.kind = 'minimum'
  if (cell.evidence === 'estimated') out.estimated = true
  return out
}

/**
 * Whether `target` stands clear of every other cell in one direction.
 * - 'overlap':    some uncertainty range (or value, where the range is
 *                 unknown) reaches the target's range; no claim is made
 * - 'unverified': no overlap among the known values, but an uncertainty
 *                 needed to prove the difference is unknown
 * - 'distinct':   every range is known and none overlaps the target's
 * @param {object} target
 * @param {object[]} others
 * @param {'high'|'low'} dir
 */
export function separation(target, others, dir) {
  const span = (c) => interval(c) ?? [c.value, c.value]
  const [tLo, tHi] = span(target)
  let unknown = interval(target) == null
  for (const o of others) {
    const [oLo, oHi] = span(o)
    if (dir === 'high' ? tLo <= oHi : tHi >= oLo) return 'overlap'
    if (interval(o) == null) unknown = true
  }
  return unknown ? 'unverified' : 'distinct'
}

/**
 * Ranking for one quantity row over the compared planets (Earth excluded).
 * @param {{ cell: object, name: string }[]} entries
 * @returns {{ status: 'insufficient'|'notRanked'|'ranked', reason: string|null, basis?: 'direct'|'estimated',
 *             highest?: { planetId: string, separation: string }, lowest?: { planetId: string, separation: string } }}
 */
export function rankRow(entries) {
  if (entries.length < 2) return { status: 'insufficient', reason: 'Ranking needs at least two planets' }

  const blocked = entries.find((e) => !e.cell.rankable)
  if (blocked) {
    const c = blocked.cell
    const why = c.kind === 'missing' ? 'has no value' : c.limit ? `has only ${LIMIT_WORD[c.limit] ?? 'a limit'}` : 'has an assumed value'
    return { status: 'notRanked', reason: `Not ranked: ${blocked.name} ${why}` }
  }

  const classes = new Set(entries.map((e) => e.cell.evidence))
  if (classes.has('minimum')) {
    return {
      status: 'notRanked',
      reason:
        classes.size === 1
          ? 'Not ranked: minimum masses (M sin i) cannot be ordered because each true mass depends on an unknown orbital tilt'
          : 'Not ranked: mixes minimum masses (M sin i) with other masses',
    }
  }
  if (classes.size > 1) return { status: 'notRanked', reason: 'Not ranked: mixes model-based estimates with measured values' }

  let hi = entries[0]
  let lo = entries[0]
  for (const e of entries) {
    if (e.cell.value > hi.cell.value) hi = e
    if (e.cell.value < lo.cell.value) lo = e
  }
  const others = (t) => entries.filter((e) => e !== t).map((e) => e.cell)
  return {
    status: 'ranked',
    reason: null,
    basis: [...classes][0],
    highest: { planetId: hi.cell.planetId, separation: separation(hi.cell, others(hi), 'high') },
    lowest: { planetId: lo.cell.planetId, separation: separation(lo.cell, others(lo), 'low') },
  }
}

function referenceCell(key, type) {
  if (type === 'text') {
    const value = key === 'name' ? EARTH_REFERENCE.name : key === 'host' ? EARTH_REFERENCE.host : (EARTH_REFERENCE.facts[key] ?? null)
    return value == null ? null : { value, kind: 'reference' }
  }
  const ref = earthReferenceValue(key)
  return ref ? { ...ref, kind: 'reference' } : null
}

/**
 * Comparison of 0–4 planets, grouped as COMPARE_GROUPS. Duplicate planets
 * are dropped (first occurrence kept); order is preserved.
 * @param {import('../contracts/planet.js').Planet[]} planets
 * @param {{ includeEarth?: boolean }} [opts]
 */
export function buildComparison(planets, { includeEarth = true } = {}) {
  const unique = [...new Map((planets ?? []).filter(Boolean).map((p) => [p.id, p])).values()]
  if (unique.length > MAX_COMPARE_PLANETS) throw new RangeError(`At most ${MAX_COMPARE_PLANETS} planets can be compared.`)

  const groups = COMPARE_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    rows: group.fields.map((field) => {
      const earth = includeEarth ? referenceCell(field.key, field.type) : null
      if (field.type === 'text') {
        const cells = unique.map((p) => {
          const value = field.get(p)
          return value == null || value === '' ? { planetId: p.id, value: null, kind: 'missing' } : { planetId: p.id, value, kind: 'catalog' }
        })
        return { key: field.key, type: 'text', label: field.label, cells, earth }
      }
      const cells = unique.map((p) => compareCell(p, field))
      const ranking = rankRow(unique.map((p, i) => ({ cell: cells[i], name: p.name })))
      return { key: field.key, type: 'quantity', label: field.label, unit: field.unit, derived: Boolean(field.derived), cells, earth, ranking }
    }),
  }))

  return { planetIds: unique.map((p) => p.id), includeEarth, groups, notes: COMPARE_NOTES }
}

/** A row by key, for callers and tests. */
export function findRow(comparison, key) {
  for (const g of comparison.groups) for (const r of g.rows) if (r.key === key) return r
  return null
}
