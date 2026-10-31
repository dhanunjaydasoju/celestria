// Catalogue search and descriptive statistics for the AI — owner: AI
// (implemented by LEAD in M5 Phase 1).
//
// Deterministic filters over canonical NASA values. A planet whose value is
// missing (or would only exist as an imputed value) never matches a range
// filter, and limit values ("< 5 M⊕") never match either: the true value is
// not known. Every response lists the exact criteria applied so the answer
// can state them.

import { formatPlanetSummary, formatQuantity, getField, LABELS, SUMMARY_DEFAULT_FIELDS, UNITS } from './format.js'

/** Range parameters: `<key>_min` / `<key>_max` → planet field. */
export const RANGE_FIELDS = {
  radius: 'radiusEarth',
  mass: 'massEarth',
  density: 'densityGcc',
  eq_temp: 'eqTempK',
  insolation: 'insolationEarth',
  period: 'periodDays',
  semi_major_axis: 'semiMajorAxisAU',
  eccentricity: 'eccentricity',
  distance: 'distancePc',
  star_teff: 'star.teff',
  star_mass: 'star.massSun',
}

export const DISCOVERY_METHODS = [
  'Transit', 'Radial Velocity', 'Microlensing', 'Imaging', 'Transit Timing Variations', 'Eclipse Timing Variations',
  'Orbital Brightness Modulation', 'Pulsar Timing', 'Astrometry', 'Pulsation Timing Variations', 'Disk Kinematics',
]
export const SPECTRAL_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M']

/** Usable value for filtering: canonical, not missing/imputed, not a limit. */
function filterValue(p, field) {
  const node = formatQuantity(getField(p, field), field)
  if (node.status === 'unavailable' || node.limit) return null
  return node
}

const spectralClass = (p) => {
  const m = /^\s*([OBAFGKM])/i.exec(p.star?.spectralType ?? '')
  return m ? m[1].toUpperCase() : null
}

const range = (field, min, max) => (p) => {
  const n = filterValue(p, field)
  return n != null && (min == null || n.value >= min) && (max == null || n.value <= max)
}

/** Named searches; each states its definition so the answer can quote it. */
export const PRESETS = {
  earth_size: { describe: 'radius 0.8–1.25 R⊕', test: range('radiusEarth', 0.8, 1.25) },
  super_earth: { describe: 'radius 1.25–2 R⊕', test: range('radiusEarth', 1.25, 2) },
  sub_neptune: { describe: 'radius 2–4 R⊕', test: range('radiusEarth', 2, 4) },
  giant: { describe: 'radius ≥ 8 R⊕, or mass ≥ 95 M⊕ when radius is unavailable', test: (p) => range('radiusEarth', 8)(p) || (!filterValue(p, 'radiusEarth') && range('massEarth', 95)(p)) },
  temperate: { describe: 'equilibrium temperature 180–310 K', test: range('eqTempK', 180, 310) },
  hot_jupiter: {
    describe: 'giant (radius ≥ 8 R⊕, or mass ≥ 95 M⊕ when radius is unavailable) with orbital period ≤ 10 days',
    test: (p) => PRESETS.giant.test(p) && range('periodDays', null, 10)(p),
  },
  ultra_short_period: { describe: 'orbital period < 1 day', test: (p) => range('periodDays', null, 1)(p) && filterValue(p, 'periodDays').value < 1 },
  nearby: { describe: 'distance ≤ 10 pc (≈ 32.6 light-years)', test: range('distancePc', null, 10) },
  m_dwarf_host: { describe: 'host star of spectral class M, or star temperature < 3900 K when no spectral type is listed', test: (p) => spectralClass(p) === 'M' || (!spectralClass(p) && range('star.teff', null, 3899.999)(p)) },
  directly_imaged: { describe: 'discovered by direct imaging', test: (p) => p.discovery?.method === 'Imaging' },
  eccentric: { describe: 'measured eccentricity ≥ 0.4', test: (p) => { const n = filterValue(p, 'eccentricity'); return n != null && n.status === 'measured' && n.value >= 0.4 } },
  multi_planet: { describe: 'system with 3 or more known planets', test: (p) => (p.system?.planetCount ?? 0) >= 3 },
}

const SORT_KEYS = [...Object.keys(RANGE_FIELDS), 'discovery_year', 'name']

/**
 * Build a predicate from tool arguments.
 * @returns {{ test: (p: object) => boolean, criteria: string[], errors: string[] }}
 */
export function buildFilter(args = {}) {
  const tests = []
  const criteria = []
  const errors = []
  const presets = args.presets ?? []
  for (const name of presets) {
    const preset = PRESETS[name]
    if (!preset) errors.push(`Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(', ')}`)
    else {
      tests.push(preset.test)
      criteria.push(`${name}: ${preset.describe}`)
    }
  }
  for (const [key, field] of Object.entries(RANGE_FIELDS)) {
    const min = args[`${key}_min`]
    const max = args[`${key}_max`]
    if (min == null && max == null) continue
    if (min != null && max != null && min > max) errors.push(`${key}_min (${min}) is greater than ${key}_max (${max})`)
    tests.push(range(field, min, max))
    const unit = UNITS[field] ? ` ${UNITS[field]}` : ''
    criteria.push(`${LABELS[field]} ${min != null && max != null ? `${min}–${max}${unit}` : min != null ? `≥ ${min}${unit}` : `≤ ${max}${unit}`}`)
  }
  if (args.discovery_year_min != null || args.discovery_year_max != null) {
    const lo = args.discovery_year_min ?? -Infinity
    const hi = args.discovery_year_max ?? Infinity
    tests.push((p) => p.discovery?.year != null && p.discovery.year >= lo && p.discovery.year <= hi)
    criteria.push(`Discovery year ${Number.isFinite(lo) ? lo : '…'}–${Number.isFinite(hi) ? hi : '…'}`)
  }
  if (args.discovery_method) {
    tests.push((p) => p.discovery?.method === args.discovery_method)
    criteria.push(`Discovery method: ${args.discovery_method}`)
  }
  if (args.spectral_class) {
    tests.push((p) => spectralClass(p) === args.spectral_class)
    criteria.push(`Host star spectral class ${args.spectral_class} (planets whose star has no listed spectral type are excluded)`)
  }
  if (args.host_contains) {
    const needle = args.host_contains.toLowerCase()
    tests.push((p) => p.host.toLowerCase().includes(needle))
    criteria.push(`Host name contains "${args.host_contains}"`)
  }
  if (args.require_measured) {
    // Every filtered or sorted field must be a direct measurement.
    const fields = Object.entries(RANGE_FIELDS)
      .filter(([k]) => args[`${k}_min`] != null || args[`${k}_max`] != null || args.sort_by === k)
      .map(([, f]) => f)
    tests.push((p) => fields.every((f) => filterValue(p, f)?.status === 'measured'))
    criteria.push('Only directly measured values for the filtered fields (no minimum masses, estimates or calculated values)')
  }
  if (args.include_controversial !== true) {
    tests.push((p) => !p.flags?.controversial)
    criteria.push('Excludes planets the NASA archive flags as controversial')
  }
  return { test: (p) => tests.every((t) => t(p)), criteria, errors }
}

function sortValue(p, key) {
  if (key === 'name') return p.name
  if (key === 'discovery_year') return p.discovery?.year ?? null
  return filterValue(p, RANGE_FIELDS[key])?.value ?? null
}

function sortPlanets(list, key, order) {
  const dir = order === 'desc' ? -1 : 1
  return [...list].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (va == null && vb == null) return a.name.localeCompare(b.name)
    if (va == null) return 1 // missing values always last
    if (vb == null) return -1
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
    return c * dir || a.name.localeCompare(b.name)
  })
}

/** search_planets */
export function searchPlanets(ctx, args = {}) {
  const filter = buildFilter(args)
  if (filter.errors.length) return { status: 'invalid_arguments', errors: filter.errors }
  if (!filter.criteria.some((c) => !c.startsWith('Excludes planets'))) {
    return { status: 'invalid_arguments', errors: ['Give at least one filter or preset (e.g. presets: ["earth_size", "temperate"]).'] }
  }
  const sortBy = SORT_KEYS.includes(args.sort_by) ? args.sort_by : 'distance'
  const order = args.order === 'desc' ? 'desc' : 'asc'
  const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? 8)), 12)
  const matches = sortPlanets(ctx.planets.filter(filter.test), sortBy, order)

  const fields = new Set(SUMMARY_DEFAULT_FIELDS)
  for (const [key, field] of Object.entries(RANGE_FIELDS)) {
    if (args[`${key}_min`] != null || args[`${key}_max`] != null || sortBy === key) fields.add(field)
  }
  for (const name of args.presets ?? []) {
    if (['temperate'].includes(name)) fields.add('eqTempK')
    if (['eccentric'].includes(name)) fields.add('eccentricity')
    if (['m_dwarf_host'].includes(name)) fields.add('star.teff')
  }
  return {
    status: matches.length ? 'ok' : 'no_matches',
    criteria: filter.criteria,
    sortedBy: `${sortBy} (${order}); planets without a value for it are listed last`,
    totalMatches: matches.length,
    returned: Math.min(limit, matches.length),
    planets: matches.slice(0, limit).map((p) => ({ ...formatPlanetSummary(p, [...fields]), discoveryMethod: p.discovery?.method ?? null, discoveryYear: p.discovery?.year ?? null })),
    note: 'Only NASA catalogue values are used; planets missing a filtered value are not matched.',
  }
}

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo)
}
const round = (v) => Number(v.toPrecision(4))

/** catalog_facts: counts and descriptive statistics of catalogue values. */
export function catalogFacts(ctx, args = {}) {
  const filter = buildFilter({ ...args, include_controversial: args.include_controversial ?? true })
  if (filter.errors.length) return { status: 'invalid_arguments', errors: filter.errors }
  const planets = ctx.planets.filter(filter.test)
  const out = {
    status: 'ok',
    catalogue: { name: 'NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars)', retrievedAt: ctx.meta?.retrievedAt ?? null, url: 'https://exoplanetarchive.ipac.caltech.edu' },
    criteria: filter.criteria,
    planetCount: { value: planets.length, status: 'catalog' },
    hostCount: { value: new Set(planets.map((p) => p.host)).size, status: 'catalog' },
  }
  if (!args.field) {
    const methods = {}
    const years = []
    for (const p of planets) {
      const m = p.discovery?.method ?? 'Unknown'
      methods[m] = (methods[m] ?? 0) + 1
      if (p.discovery?.year != null) years.push(p.discovery.year)
    }
    out.byDiscoveryMethod = Object.fromEntries(Object.entries(methods).sort((a, b) => b[1] - a[1]))
    if (years.length) out.discoveryYears = { first: Math.min(...years), latest: Math.max(...years) }
    return out
  }
  const field = RANGE_FIELDS[args.field]
  if (!field) return { status: 'invalid_arguments', errors: [`Unknown field "${args.field}". Available: ${Object.keys(RANGE_FIELDS).join(', ')}`] }

  const byStatus = { unavailable: 0 }
  const values = []
  for (const p of planets) {
    const n = formatQuantity(getField(p, field), field)
    byStatus[n.status] = (byStatus[n.status] ?? 0) + 1
    if (n.status !== 'unavailable' && !n.limit) values.push([n.value, p])
  }
  values.sort((a, b) => a[0] - b[0])
  out.field = { name: LABELS[field], unit: UNITS[field] }
  out.valuesByStatus = byStatus
  if (!values.length) return { ...out, status: 'no_values' }
  const sorted = values.map((v) => v[0])
  const ref = ([value, p]) => ({ value, planet: p.name, id: p.id, profileUrl: `/planet/${p.id}` })
  out.statistics = {
    status: 'catalog statistic',
    unit: UNITS[field],
    count: values.length,
    min: ref(values[0]),
    max: ref(values.at(-1)),
    median: round(quantile(sorted, 0.5)),
    lowerQuartile: round(quantile(sorted, 0.25)),
    upperQuartile: round(quantile(sorted, 0.75)),
    note: 'Descriptive statistics of the catalogue values that exist (limits and missing values excluded). They describe the catalogue, not any individual planet, and are never used as a value for a planet.',
  }
  return out
}
