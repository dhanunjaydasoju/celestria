// Analysis-only gap filling: physics first, then grouped medians — owner:
// DATA (implemented by LEAD in M4). Policy: CLAUDE.md §5a.
//
// Produces a SEPARATE layer: imputations[planetId][field] = entry. Planets
// are never modified; a missing value stays { value: null, status:
// 'missing' } in the canonical data. Only explicit analysis consumers may
// read this layer — never profiles, readouts, orbital physics, habitability
// or the AI astronomer.

import { scienceValue } from '../contracts/planet.js'
import { isFixedCircular } from '../science/derived.js'

export const MEDIAN_LABEL = 'Estimated — Median Imputed'
export const MIN_GROUP_SIZE = 20
const R_SUN_AU = 695700 / 149597870.7
const EARTH_TEQ_K = 278.6 // zero albedo, full redistribution, 1 S⊕

/** Fields that must never appear in the imputation layer (CLAUDE.md §5a). */
export const NEVER_IMPUTE = [
  'id', 'name', 'host', 'discovery', 'flags', 'system',
  'periodDays', 'semiMajorAxisAU', 'inclinationDeg', 'periastronArgDeg',
  'periastronTimeJD', 'transitMidJD', 'star.spectralType', 'star.name', 'star.lumLog',
]

// ── Valid source values ──────────────────────────────────────────────────
// Only measured or NASA-calculated values, never limits, model estimates,
// minimum masses, assumed (fixed-0) eccentricities or imputed values.
const validSource = (q) =>
  q != null && q.value != null && Number.isFinite(q.value) && (q.status === 'measured' || q.status === 'calculated') && !q.limit

const VALID = {
  default: validSource,
  massEarth: (q) => validSource(q) && q.kind === 'Mass',
  eccentricity: (q) => validSource(q) && !isFixedCircular(q),
}

// ── Grouping covariates (never the field being imputed) ──────────────────
const bin = (v, edges, labels) => {
  if (v == null) return null
  const i = edges.findIndex((e) => v < e)
  return labels[i === -1 ? labels.length - 1 : i]
}
const radiusBin = (p) => {
  const r = scienceValue(p.radiusEarth)
  return r == null ? null : `radius ${bin(r, [1.6, 4, 8], ['≤1.6', '1.6–4', '4–8', '>8'])} R⊕`
}
// Mass as a grouping covariate may be a true mass or M sin i (a lower bound
// is still informative for grouping); it is never a median input.
const massBin = (p) => {
  const m = scienceValue(p.massEarth)
  return m == null ? null : `mass ${bin(m, [2, 10, 50, 300], ['<2', '2–10', '10–50', '50–300', '>300'])} M⊕`
}
const periodBin = (p) => {
  const P = scienceValue(p.periodDays)
  return P == null ? null : `period ${bin(P, [10, 100], ['<10', '10–100', '>100'])} d`
}
const spectralClass = (p) => {
  const c = p.star?.spectralType?.trim()?.[0]?.toUpperCase()
  return c && 'OBAFGKMLTY'.includes(c) ? `spectral class ${c}` : null
}
const method = (p) => (p.discovery?.method ? `discovery: ${p.discovery.method}` : null)
// Stellar mass is present for ~99.9% of hosts and tracks Teff, radius and
// lifetime on the main sequence, so it is the fallback before global for
// star properties (bins ≈ M / K / G / F / A-and-hotter dwarfs).
const starMassBin = (p) => {
  const m = scienceValue(p.star?.massSun)
  return m == null ? null : `star mass ${bin(m, [0.45, 0.8, 1.05, 1.4], ['<0.45', '0.45–0.8', '0.8–1.05', '1.05–1.4', '>1.4'])} M☉`
}
const starTeffBin = (p) => {
  const t = scienceValue(p.star?.teff)
  return t == null ? null : `star Teff ${bin(t, [3900, 5300, 6000, 7300], ['<3900', '3900–5300', '5300–6000', '6000–7300', '>7300'])} K`
}
const sizeClass = (p) => radiusBin(p) ?? massBin(p)
const periodAndClass = (p) => {
  const a = periodBin(p)
  const b = spectralClass(p)
  return a && b ? `${a}, ${b}` : null
}

/** Imputable fields: accessor, covariate levels (most specific first). */
export const IMPUTABLE = {
  radiusEarth: { get: (p) => p.radiusEarth, levels: [['mass bin', massBin], ['discovery method', method]] },
  massEarth: { get: (p) => p.massEarth, levels: [['radius bin', radiusBin], ['discovery method', method]] },
  densityGcc: { get: (p) => p.densityGcc, levels: [['size class', sizeClass]] },
  eccentricity: { get: (p) => p.eccentricity, levels: [['period bin', periodBin]] },
  eqTempK: { get: (p) => p.eqTempK, levels: [['period × spectral class', periodAndClass], ['period bin', periodBin]] },
  insolationEarth: { get: (p) => p.insolationEarth, levels: [['period × spectral class', periodAndClass], ['period bin', periodBin]] },
  'star.teff': { get: (p) => p.star?.teff, levels: [['spectral class', spectralClass], ['star mass bin', starMassBin]] },
  'star.massSun': { get: (p) => p.star?.massSun, levels: [['spectral class', spectralClass], ['star Teff bin', starTeffBin]] },
  'star.radiusSun': { get: (p) => p.star?.radiusSun, levels: [['spectral class', spectralClass], ['star mass bin', starMassBin]] },
  'star.metallicity': { get: (p) => p.star?.metallicity, levels: [['spectral class', spectralClass], ['star mass bin', starMassBin]] },
  'star.ageGyr': { get: (p) => p.star?.ageGyr, levels: [['spectral class', spectralClass], ['star mass bin', starMassBin]] },
}

// ── Statistics ───────────────────────────────────────────────────────────
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function summarize(values) {
  const s = [...values].sort((a, b) => a - b)
  if (!s.length) return null
  return { median: quantile(s, 0.5), iqr: [quantile(s, 0.25), quantile(s, 0.75)], n: s.length }
}

/**
 * Median tables per field: global and per covariate group, from valid source
 * values only.
 * @param {import('../contracts/planet.js').Planet[]} planets
 */
export function computeMedianTable(planets) {
  const table = {}
  for (const [field, cfg] of Object.entries(IMPUTABLE)) {
    const valid = VALID[field] ?? VALID.default
    const inputs = planets.filter((p) => valid(cfg.get(p)))
    const levels = cfg.levels.map(([name, keyOf]) => {
      const groups = new Map()
      for (const p of inputs) {
        const k = keyOf(p)
        if (k != null) groups.set(k, [...(groups.get(k) ?? []), cfg.get(p).value])
      }
      return { name, groups: Object.fromEntries([...groups].map(([k, vs]) => [k, summarize(vs)])) }
    })
    table[field] = { global: summarize(inputs.map((p) => cfg.get(p).value)), levels }
  }
  return table
}

// ── Physics before medians ───────────────────────────────────────────────
function physicsValue(field, p) {
  const a = scienceValue(p.semiMajorAxisAU)
  if (field === 'eqTempK') {
    const teff = scienceValue(p.star?.teff)
    const rs = scienceValue(p.star?.radiusSun)
    if (teff && rs && a) {
      return {
        value: teff * Math.sqrt((rs * R_SUN_AU) / (2 * a)),
        basis: 'Teq = Teff·√(R★/2a); zero albedo, full heat redistribution',
      }
    }
    const S = scienceValue(p.insolationEarth)
    if (S > 0) return { value: EARTH_TEQ_K * S ** 0.25, basis: 'Teq = 278.6 K · S^¼ from insolation; zero albedo, full heat redistribution' }
  }
  if (field === 'insolationEarth') {
    const lumLog = scienceValue(p.star?.lumLog)
    if (lumLog != null && a) return { value: 10 ** lumLog / (a * a), basis: 'S = L★ / a² (solar units)' }
    const T = scienceValue(p.eqTempK)
    if (T > 0) return { value: (T / EARTH_TEQ_K) ** 4, basis: 'S = (Teq / 278.6 K)⁴ from equilibrium temperature; zero albedo' }
  }
  if (field === 'densityGcc') {
    const m = p.massEarth
    const r = scienceValue(p.radiusEarth)
    if (m?.kind === 'Mass' && scienceValue(m) && r) return { value: 5.514 * (m.value / r ** 3), basis: 'ρ = 5.514 g/cm³ · M / R³ (Earth units)' }
  }
  return null
}

/**
 * Fill gaps in an analysis layer. Never mutates `planets`.
 * @param {import('../contracts/planet.js').Planet[]} planets
 * @param {{ catalogVersion?: string, minGroupSize?: number }} [opts]
 */
export function imputeCatalog(planets, { catalogVersion = 'unknown', minGroupSize = MIN_GROUP_SIZE } = {}) {
  const table = computeMedianTable(planets)
  const imputations = {}
  const summary = Object.fromEntries(Object.keys(IMPUTABLE).map((f) => [f, { median: 0, calculated: 0, unavailable: 0 }]))

  for (const p of planets) {
    for (const [field, cfg] of Object.entries(IMPUTABLE)) {
      const q = cfg.get(p)
      if (q?.value != null) continue // present (any status): never replaced
      let entry = null

      const phys = physicsValue(field, p)
      if (phys && Number.isFinite(phys.value)) {
        entry = { value: phys.value, method: 'calculated', label: 'Calculated', basis: phys.basis, catalogVersion }
      } else {
        const t = table[field]
        for (const [levelIndex, [name, keyOf]] of cfg.levels.entries()) {
          const key = keyOf(p)
          const g = key != null ? t.levels[levelIndex].groups[key] : null
          if (g && g.n >= minGroupSize) {
            entry = { value: g.median, method: 'median', label: MEDIAN_LABEL, group: key, groupLevel: name, fallbackDepth: levelIndex, groupSize: g.n, iqr: g.iqr, catalogVersion }
            break
          }
        }
        if (!entry && t.global && t.global.n >= minGroupSize) {
          entry = { value: t.global.median, method: 'median', label: MEDIAN_LABEL, group: 'all planets', groupLevel: 'global', fallbackDepth: cfg.levels.length, groupSize: t.global.n, iqr: t.global.iqr, catalogVersion }
        }
      }

      if (entry) {
        ;(imputations[p.id] ??= {})[field] = Object.freeze(entry)
        summary[field][entry.method === 'median' ? 'median' : 'calculated']++
      } else {
        summary[field].unavailable++
      }
    }
  }
  return { table, imputations, summary, catalogVersion }
}

/**
 * Value for an analysis consumer that has opted in to imputed data. Returns
 * the canonical value when present, else the analysis-layer entry, always
 * with its provenance so it can be weighted or excluded.
 */
export function analysisValue(planet, field, imputations) {
  const q = IMPUTABLE[field]?.get(planet)
  if (q?.value != null) return { value: q.value, provenance: q.status, imputed: false }
  const e = imputations?.[planet.id]?.[field]
  if (e) return { value: e.value, provenance: e.method === 'median' ? 'imputed' : 'calculated', imputed: e.method === 'median', entry: e }
  return { value: null, provenance: 'missing', imputed: false }
}

/** Display adapter: an imputation entry as a Quantity with status 'imputed'. */
export function imputedQuantity(entry) {
  return {
    value: entry.value,
    status: entry.method === 'median' ? 'imputed' : 'calculated',
    basis: entry.method === 'median' ? `Median of ${entry.groupSize} planets (${entry.group})` : entry.basis,
  }
}
