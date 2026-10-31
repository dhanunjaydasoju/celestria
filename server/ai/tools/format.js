// Planet records for the AI: canonical NASA values, ready to quote —
// owner: AI (implemented by LEAD in M5 Phase 1).
//
// Every quantity becomes { value, unit, status, display, uncertainty, source }
// so the model can copy numbers instead of computing them. Conversions and
// derived values are computed HERE (deterministically) and labelled
// 'calculated' with their basis. Imputed values are never emitted: a value
// with status 'imputed' is reported as unavailable (CLAUDE.md §5a).

import { formatMeasurement } from '../../../src/components/data/formatMeasurement.js'
import { G0, distanceLightYears, isFixedCircular, isModelBasedImaging, orbitalExtremes, surfaceGravity } from '../../../src/science/derived.js'
import { classifySize, classifyThermal, ARCHETYPE_LABELS, THERMAL_LABELS } from '../../../src/three/planet/archetype.js'

export const UNITS = {
  radiusEarth: 'R⊕',
  massEarth: 'M⊕',
  densityGcc: 'g/cm³',
  eqTempK: 'K',
  insolationEarth: 'S⊕',
  periodDays: 'days',
  semiMajorAxisAU: 'AU',
  eccentricity: '',
  inclinationDeg: '°',
  periastronArgDeg: '°',
  periastronTimeJD: 'BJD',
  transitMidJD: 'BJD',
  'star.teff': 'K',
  'star.radiusSun': 'R☉',
  'star.massSun': 'M☉',
  'star.lumLog': 'log10(L/L☉)',
  'star.metallicity': 'dex',
  'star.ageGyr': 'Gyr',
  distancePc: 'pc',
}

export const LABELS = {
  radiusEarth: 'Radius',
  massEarth: 'Mass',
  densityGcc: 'Density',
  eqTempK: 'Equilibrium temperature',
  insolationEarth: 'Insolation',
  periodDays: 'Orbital period',
  semiMajorAxisAU: 'Semi-major axis',
  eccentricity: 'Eccentricity',
  inclinationDeg: 'Inclination',
  periastronArgDeg: 'Argument of periastron',
  periastronTimeJD: 'Time of periastron',
  transitMidJD: 'Transit midpoint',
  'star.teff': 'Star effective temperature',
  'star.radiusSun': 'Star radius',
  'star.massSun': 'Star mass',
  'star.lumLog': 'Star luminosity',
  'star.metallicity': 'Star metallicity',
  'star.ageGyr': 'Star age',
  distancePc: 'Distance from Earth',
}

const EARTH_MASSES_PER_JUPITER = 317.83
const EARTH_RADII_PER_JUPITER = 11.209
const ARCHIVE = 'https://exoplanetarchive.ipac.caltech.edu'

export const getField = (planet, field) =>
  field.startsWith('star.') ? planet.star?.[field.slice(5)] : field === 'distancePc' ? planet.system?.distancePc : planet[field]

/** Display text with uncertainty and unit, e.g. "0.920 +0.013 −0.012 R⊕". */
function display(value, err, unit, limit) {
  const f = formatMeasurement(value, err)
  const unc = f.plus ? (f.symmetric ? ` ±${f.plus}` : ` +${f.plus} −${f.minus}`) : ''
  return `${limit ? `${limit} ` : ''}${f.value}${unc}${unit ? ` ${unit}` : ''}`
}

/**
 * @param {import('../../../src/contracts/planet.js').Quantity|undefined} q
 * @param {string} field
 */
export function formatQuantity(q, field, { compact = false } = {}) {
  const unit = UNITS[field] ?? ''
  if (!q || q.value == null || q.status === 'missing' || q.status === 'imputed') {
    return { status: 'unavailable', unit, display: 'Unavailable' }
  }
  let status = q.status
  if (q.kind === 'Msini') status = 'minimum'
  else if (q.kind === 'M-R') status = 'estimated'
  else if (field === 'eccentricity' && isFixedCircular(q)) status = 'assumed'
  const out = { value: q.value, unit, status, display: display(q.value, q.err, unit, q.limit) }
  if (q.err) out.uncertainty = { plus: Math.abs(q.err[0]), minus: Math.abs(q.err[1]) }
  if (q.limit) out.limit = q.limit === '<' ? 'upper limit' : 'lower limit'
  if (q.source) out.source = compact ? q.source.label : { label: q.source.label, url: q.source.url }
  if (compact) return out
  if (status === 'minimum') out.note = 'M sin i: true mass is this value or larger (orbital tilt unknown)'
  if (status === 'estimated' && q.kind === 'M-R') out.note = "Estimated from NASA's mass–radius relation, not measured"
  if (status === 'assumed') out.note = 'Fixed at 0 (circular orbit) in the source fit; not measured'
  return out
}

/** A value computed by CELESTRIA from catalogue values. */
function derived(value, unit, basis, { status = 'calculated', err } = {}) {
  if (value == null || !Number.isFinite(value)) return null
  // Unit conversions keep their input's provenance; formulas are 'calculated'.
  const out = { value: Number(value.toPrecision(6)), unit, status, display: display(value, err, unit), basis }
  if (err) out.uncertainty = { plus: Number(Math.abs(err[0]).toPrecision(4)), minus: Number(Math.abs(err[1]).toPrecision(4)) }
  return out
}

export const planetLinks = (p) => ({
  profileUrl: `/planet/${p.id}`,
  viewportUrl: `/viewport/${p.id}`,
  systemUrl: `/explore/${encodeURIComponent(p.host)}`,
  orbitUrl: `/planet/${p.id}/orbit`,
  nasaOverviewUrl: `${ARCHIVE}/overview/${encodeURIComponent(p.name)}`,
})

function visualType(p) {
  const size = classifySize(p)
  const thermal = classifyThermal(p)
  return {
    label: `${ARCHETYPE_LABELS[size.type]}${thermal.band !== 'unknown' ? ` · ${THERMAL_LABELS[thermal.band]}` : ''}`,
    status: 'classification',
    basis: size.sizeBasis
      ? `Size class from ${size.sizeBasis.field === 'radiusEarth' ? 'radius' : 'mass'} thresholds (≤1.6, 1.6–4, 4–8, >8 R⊕); temperature band from ${thermal.thermalBasis ? 'equilibrium temperature' : 'no data'}`
      : 'Insufficient data to classify',
    caveat: 'A visual size/temperature class, not a measured composition.',
  }
}

const PLANET_FIELDS = ['radiusEarth', 'massEarth', 'densityGcc', 'eqTempK', 'insolationEarth', 'periodDays', 'semiMajorAxisAU', 'eccentricity', 'inclinationDeg']
const SUMMARY_FIELDS = ['radiusEarth', 'massEarth', 'eqTempK', 'periodDays', 'semiMajorAxisAU', 'distancePc']
const STAR_FIELDS = ['star.teff', 'star.massSun', 'star.radiusSun', 'star.lumLog', 'star.metallicity', 'star.ageGyr']

export const SUMMARY_DEFAULT_FIELDS = SUMMARY_FIELDS

/** Compact row for search results and lists (source labels only, no notes). */
export function formatPlanetSummary(p, fields = SUMMARY_FIELDS) {
  const row = { id: p.id, name: p.name, host: p.host, profileUrl: `/planet/${p.id}`, type: visualType(p).label }
  for (const f of fields) row[f] = formatQuantity(getField(p, f), f, { compact: true })
  return row
}

/** Full record for get_planet. */
export function formatPlanet(p) {
  const out = { id: p.id, name: p.name, host: p.host, links: planetLinks(p), type: visualType(p), planet: {}, star: {}, discovery: {}, derived: {}, unavailable: [], notes: [] }
  for (const f of PLANET_FIELDS) out.planet[f] = formatQuantity(getField(p, f), f)
  for (const f of STAR_FIELDS) out.star[f.slice(5)] = formatQuantity(getField(p, f), f)
  out.star.name = p.star?.name ?? p.host
  out.star.spectralType = p.star?.spectralType ?? null
  out.system = {
    distancePc: formatQuantity(getField(p, 'distancePc'), 'distancePc'),
    planetCount: p.system?.planetCount ?? null,
    starCount: p.system?.starCount ?? null,
  }
  out.discovery = { method: p.discovery?.method ?? null, year: p.discovery?.year ?? null, facility: p.discovery?.facility ?? null }

  // Deterministic derived values (the model must not compute these itself).
  const convert = (node, factor, unit, basis) =>
    node.value == null ? null : derived(node.value / factor, unit, basis, { status: node.status, err: node.uncertainty && [node.uncertainty.plus / factor, -node.uncertainty.minus / factor] })
  out.derived.massJupiter = convert(out.planet.massEarth, EARTH_MASSES_PER_JUPITER, 'M_J', `unit conversion: 1 M_J = ${EARTH_MASSES_PER_JUPITER} M⊕`)
  out.derived.radiusJupiter = convert(out.planet.radiusEarth, EARTH_RADII_PER_JUPITER, 'R_J', `unit conversion: 1 R_J = ${EARTH_RADII_PER_JUPITER} R⊕`)
  const g = surfaceGravity(p)
  if (g) {
    out.derived.surfaceGravity = derived(g.value, 'm/s²', g.basis, { err: g.err })
    out.derived.surfaceGravityEarth = derived(g.earthRatio, '× Earth', g.basis, { err: g.err && g.err.map((e) => e / G0) })
  }
  const ext = orbitalExtremes(p)
  if (ext) {
    out.derived.periastronAU = derived(ext.periastron.value, 'AU', 'a(1 − e)')
    out.derived.apoastronAU = derived(ext.apoastron.value, 'AU', 'a(1 + e)')
  }
  const ly = distanceLightYears(p.system?.distancePc)
  if (ly) out.derived.distanceLightYears = derived(ly.value, 'light-years', ly.basis, { err: ly.err })
  for (const k of Object.keys(out.derived)) if (!out.derived[k]) delete out.derived[k]

  for (const [group, fields] of [['planet', PLANET_FIELDS], ['star', STAR_FIELDS]]) {
    for (const f of fields) {
      const key = group === 'star' ? f.slice(5) : f
      if (out[group][key].status === 'unavailable') out.unavailable.push(LABELS[f])
    }
  }
  if (out.system.distancePc.status === 'unavailable') out.unavailable.push(LABELS.distancePc)
  out.unavailable.push('Atmosphere composition (not in the NASA catalogue)')

  if (isModelBasedImaging(p)) out.notes.push('Directly imaged: mass and radius come from evolutionary models in the cited paper; surface gravity not derived.')
  if (p.flags?.controversial) out.notes.push('The NASA archive flags this planet as controversial.')
  out.notes.push('Values come from the NASA Exoplanet Archive composite table and may combine different publications.')

  const sources = new Map()
  const collect = (node) => {
    if (node?.source?.label) sources.set(node.source.label + (node.source.url ?? ''), node.source)
  }
  Object.values(out.planet).forEach(collect)
  Object.values(out.star).forEach(collect)
  collect(out.system.distancePc)
  out.sources = [...sources.values()]
  return out
}
