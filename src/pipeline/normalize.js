// NASA pscomppars row → canonical Planet (src/contracts/planet.js) — owner:
// DATA (implemented by LEAD in M4). Provenance rules: CLAUDE.md §5. This is
// the only place raw NASA columns are interpreted. Missing values stay
// missing; nothing is imputed here (CLAUDE.md §5a).

import { decodeHtmlEntities } from './entities.js'
import { IDENTITY_COLUMNS, PLANET_FIELDS, STAR_FIELDS, limColumn } from './nasaColumns.js'

const ARCHIVE = 'https://exoplanetarchive.ipac.caltech.edu'

export const slug = (name) =>
  name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Reflink HTML → { label, url } with entities decoded. */
export function parseSource(reflink) {
  if (!reflink) return undefined
  const label = decodeHtmlEntities(reflink.replace(/<[^>]*>/g, '').trim())
  const href = reflink.match(/href=([^\s>]+)/)?.[1] ?? null
  const url = href ? new URL(href, ARCHIVE).toString() : null
  return { label, url }
}

function quantity(row, col, { status } = {}) {
  const value = row[col]
  if (value == null || !Number.isFinite(value)) return { value: null, status: 'missing' }
  const reflink = row[`${col}_reflink`]
  const out = { value, status: status ?? (reflink?.includes('CALCULATED_VALUE') ? 'calculated' : 'measured') }
  const e1 = row[`${col}err1`]
  const e2 = row[`${col}err2`]
  if (Number.isFinite(e1) && Number.isFinite(e2)) out.err = [e1, e2]
  const lim = row[limColumn(col)]
  if (lim === 1) out.limit = '<'
  if (lim === -1) out.limit = '>'
  const source = parseSource(reflink)
  if (source) out.source = source
  return out
}

function massQuantity(row) {
  const prov = row.pl_bmassprov
  const kind = prov === 'Msini' ? 'Msini' : prov === 'M-R relationship' ? 'M-R' : 'Mass'
  const base = quantity(row, 'pl_bmasse')
  if (base.status === 'missing') return base
  if (kind === 'M-R') base.status = 'estimated'
  return { ...base, kind }
}

/** True when a row has what every Planet needs. */
export function isValidRow(row) {
  return typeof row?.pl_name === 'string' && row.pl_name.length > 0 && typeof row.hostname === 'string' && row.hostname.length > 0
}

/**
 * @param {Record<string, any>} row  one pscomppars row (TAP JSON)
 * @returns {import('../contracts/planet.js').Planet}
 */
export function normalizeRow(row) {
  const planet = { id: slug(row.pl_name), name: row.pl_name, host: row.hostname }
  for (const [field, col] of Object.entries(PLANET_FIELDS)) planet[field] = quantity(row, col)
  planet.massEarth = massQuantity(row)
  planet.star = { name: row.hostname, spectralType: row.st_spectype ?? null }
  for (const [field, col] of Object.entries(STAR_FIELDS)) planet.star[field] = quantity(row, col)
  planet.discovery = {
    year: row.disc_year ?? null,
    method: row.discoverymethod ?? null,
    facility: row.disc_facility ?? null,
    telescope: row.disc_telescope ?? null,
  }
  planet.system = {
    distancePc: quantity(row, 'sy_dist'),
    planetCount: row.sy_pnum ?? null,
    starCount: row.sy_snum ?? null,
    raDeg: row.ra ?? null,
    decDeg: row.dec ?? null,
    vMag: row.sy_vmag ?? null,
  }
  planet.flags = { controversial: row.pl_controv_flag === 1, ttv: row.ttv_flag === 1 }
  return planet
}

export { IDENTITY_COLUMNS }
