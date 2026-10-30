// Builds src/three/lab/fixtures.json from the live NASA Exoplanet Archive —
// owner: LEAD. Lab-only data so 3D work is not blocked on DATA's fixtures
// (D3.1). The production normalizer is server/nasa/normalize.js (DATA); this
// script follows the same provenance rules (CLAUDE.md §5) in a minimal form.
//
// Append-only: planets already in fixtures.json are never re-fetched or
// rewritten, so lab results stay stable. To add planets, append names to a
// list below and re-run.
//
// Usage: node scripts/build-lab-fixtures.js

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/three/lab/fixtures.json')
const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'

// Chosen to cover every archetype × temperature band, sparse data and
// mass-only classification.
const PLANETS = [
  'TRAPPIST-1 e', // temperate rocky, M dwarf
  'LHS 1140 b', // temperate super-Earth
  '55 Cnc e', // scorching rocky
  'Kepler-10 b', // scorching rocky, Sun-like star
  'GJ 1214 b', // warm sub-Neptune
  'K2-18 b', // temperate sub-Neptune
  'GJ 436 b', // hot Neptune-like
  'HAT-P-11 b', // hot Neptune-like
  'HD 209458 b', // hot Jupiter
  'WASP-12 b', // scorching giant
  'Kepler-167 e', // cold giant
  'HD 80606 b', // eccentric giant (orbit tests)
  'Proxima Cen b', // no radius: classified by minimum mass
  'OGLE-2005-BLG-390L b', // microlensing: sparse
]

// Featured planets requested for the demo collection (2026-10-31). Names
// already in PLANETS above are skipped automatically.
const FEATURED = [
  'Proxima Cen b',
  'Kepler-452 b',
  'K2-18 b',
  '51 Peg b',
  'WASP-12 b',
  '55 Cnc e',
  'GJ 1214 b',
  'HR 8799 b',
  'Kepler-16 b', // circumbinary: catalog star values describe the primary
  'HD 189733 b',
]

// field → [column, unit]; *_reflink, *err1/2, *lim are fetched alongside.
const PLANET_FIELDS = {
  radiusEarth: 'pl_rade',
  massEarth: 'pl_bmasse',
  densityGcc: 'pl_dens',
  eqTempK: 'pl_eqt',
  insolationEarth: 'pl_insol',
  periodDays: 'pl_orbper',
  semiMajorAxisAU: 'pl_orbsmax',
  eccentricity: 'pl_orbeccen',
  inclinationDeg: 'pl_orbincl',
  periastronArgDeg: 'pl_orblper',
  periastronTimeJD: 'pl_orbtper',
  transitMidJD: 'pl_tranmid',
}
const STAR_FIELDS = {
  teff: 'st_teff',
  radiusSun: 'st_rad',
  massSun: 'st_mass',
  lumLog: 'st_lum',
  metallicity: 'st_met',
  ageGyr: 'st_age',
}
const NO_ERR = new Set(['pl_tranmid'])
const LIM_COL = { pl_rade: 'pl_radelim', pl_bmasse: 'pl_bmasselim' }

const quantCols = [...Object.values(PLANET_FIELDS), ...Object.values(STAR_FIELDS), 'sy_dist']
const columns = [
  'pl_name', 'hostname', 'sy_snum', 'sy_pnum', 'pl_controv_flag', 'ttv_flag',
  'discoverymethod', 'disc_year', 'disc_facility', 'disc_telescope',
  'pl_bmassprov', 'st_spectype', 'ra', 'dec', 'sy_vmag',
  ...quantCols.flatMap((c) => [c, `${c}_reflink`, `${c}err1`, `${c}err2`, `${c.replace(/^(pl|st|sy)_/, '$1_')}lim`]),
]
  .map((c) => (c.endsWith('lim') ? limColumn(c) : c))
  .filter(Boolean)

function limColumn(c) {
  // NASA names limit flags inconsistently (pl_radelim vs pl_orbperlim).
  const base = c.slice(0, -3)
  return LIM_COL[base] ?? `${base}lim`
}

const slug = (name) =>
  name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function parseSource(reflink) {
  if (!reflink) return undefined
  const label = reflink.replace(/<[^>]*>/g, '').trim()
  const href = reflink.match(/href=([^\s>]+)/)?.[1] ?? null
  const url = href ? new URL(href, 'https://exoplanetarchive.ipac.caltech.edu').toString() : null
  return { label, url }
}

function q(row, col, { status } = {}) {
  const value = row[col]
  if (value == null || !Number.isFinite(value)) return { value: null, status: 'missing' }
  const reflink = row[`${col}_reflink`]
  const out = { value, status: status ?? (reflink?.includes('CALCULATED_VALUE') ? 'calculated' : 'measured') }
  const e1 = row[`${col}err1`]
  const e2 = row[`${col}err2`]
  if (!NO_ERR.has(col) && Number.isFinite(e1) && Number.isFinite(e2)) out.err = [e1, e2]
  const lim = row[limColumn(`${col}lim`)]
  if (lim === 1) out.limit = '<'
  if (lim === -1) out.limit = '>'
  const source = parseSource(reflink)
  if (source) out.source = source
  return out
}

function massQuantity(row) {
  const prov = row.pl_bmassprov
  const kind = prov === 'Msini' ? 'Msini' : prov === 'M-R relationship' ? 'M-R' : 'Mass'
  const base = q(row, 'pl_bmasse')
  if (base.status === 'missing') return base
  if (kind === 'M-R') base.status = 'estimated'
  return { ...base, kind }
}

function normalize(row) {
  const planet = {
    id: slug(row.pl_name),
    name: row.pl_name,
    host: row.hostname,
  }
  for (const [field, col] of Object.entries(PLANET_FIELDS)) planet[field] = q(row, col)
  planet.massEarth = massQuantity(row)
  planet.star = { name: row.hostname, spectralType: row.st_spectype ?? null }
  for (const [field, col] of Object.entries(STAR_FIELDS)) planet.star[field] = q(row, col)
  planet.discovery = {
    year: row.disc_year ?? null,
    method: row.discoverymethod ?? null,
    facility: row.disc_facility ?? null,
    telescope: row.disc_telescope ?? null,
  }
  planet.system = {
    distancePc: q(row, 'sy_dist'),
    planetCount: row.sy_pnum ?? null,
    starCount: row.sy_snum ?? null,
    raDeg: row.ra ?? null,
    decDeg: row.dec ?? null,
    vMag: row.sy_vmag ?? null,
  }
  planet.flags = { controversial: row.pl_controv_flag === 1, ttv: row.ttv_flag === 1 }
  return planet
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const have = new Set(existing?.planets.map((p) => p.name) ?? [])
const wanted = [...new Set([...PLANETS, ...FEATURED])]
const toFetch = wanted.filter((n) => !have.has(n))

if (toFetch.length === 0) {
  console.log(`Nothing to add: all ${wanted.length} planets already in ${path.relative(process.cwd(), OUT)}`)
  process.exit(0)
}

const where = toFetch.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
const adql = `select ${[...new Set(columns)].join(',')} from pscomppars where pl_name in (${where})`
const res = await fetch(`${TAP}?query=${encodeURIComponent(adql)}&format=json`)
if (!res.ok) throw new Error(`NASA TAP ${res.status}: ${(await res.text()).slice(0, 300)}`)
const rows = await res.json()

const found = new Set(rows.map((r) => r.pl_name))
const notFound = toFetch.filter((n) => !found.has(n))
if (notFound.length) console.warn('Not in pscomppars:', notFound.join(', '))

const added = toFetch.filter((n) => found.has(n)).map((n) => normalize(rows.find((r) => r.pl_name === n)))
const now = new Date().toISOString()
const out = existing
  ? {
      ...existing,
      // Existing entries are copied through untouched; additions are logged.
      planets: [...existing.planets, ...added],
      additions: [...(existing.additions ?? []), { retrievedAt: now, planets: added.map((p) => p.name) }],
    }
  : {
      source: 'NASA Exoplanet Archive, pscomppars (https://exoplanetarchive.ipac.caltech.edu)',
      generatedAt: now,
      planets: added,
    }

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
console.log(`Added ${added.length} (${added.map((p) => p.name).join(', ')}); total ${out.planets.length} in ${path.relative(process.cwd(), OUT)}`)
