import { describe, expect, it } from 'vitest'
import lab from '../three/lab/fixtures.json'
import raw from './__fixtures__/raw-41.json'
import { decodeHtmlEntities } from './entities.js'
import { isValidRow, normalizeRow, parseSource } from './normalize.js'

/**
 * The lab fixtures (41 planets, Oct 2026) are the regression baseline. The
 * shared normalizer must reproduce them exactly, except for two intended
 * improvements: citation labels are entity-decoded, and transit midpoints
 * now carry their uncertainty.
 */
function toBaseline(planet) {
  const p = structuredClone(planet)
  if (p.transitMidJD) delete p.transitMidJD.err
  return p
}

function decodeLabels(node) {
  if (Array.isArray(node)) return node.map(decodeLabels)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = k === 'label' ? decodeHtmlEntities(v) : decodeLabels(v)
    return out
  }
  return node
}

describe('normalizeRow — 41-planet regression', () => {
  const byName = Object.fromEntries(raw.rows.map((r) => [r.pl_name, r]))

  it('has a raw row for every lab planet', () => {
    expect(raw.rows).toHaveLength(41)
    for (const p of lab.planets) expect(byName[p.name], p.name).toBeDefined()
  })

  it('reproduces every lab planet (modulo decoded labels and transit errors)', () => {
    for (const expected of lab.planets) {
      const actual = toBaseline(normalizeRow(byName[expected.name]))
      expect(actual, expected.name).toEqual(decodeLabels(expected))
    }
  })

  it('adds transit-midpoint uncertainties where NASA reports them', () => {
    const p = normalizeRow(byName['TRAPPIST-1 e'])
    expect(p.transitMidJD.err).toHaveLength(2)
  })

  it('keeps missing values missing (no imputation in normalization)', () => {
    const p = normalizeRow(byName['HR 8799 b'])
    expect(p.eccentricity).toEqual({ value: null, status: 'missing' })
    const sparse = normalizeRow({ pl_name: 'X b', hostname: 'X' })
    for (const f of ['radiusEarth', 'massEarth', 'eqTempK', 'periodDays', 'semiMajorAxisAU']) {
      expect(sparse[f]).toEqual({ value: null, status: 'missing' })
    }
  })
})

describe('provenance mapping', () => {
  it('maps NASA calculated values, M-R masses and minimum masses', () => {
    const calc = normalizeRow({ pl_name: 'A b', hostname: 'A', pl_rade: 1, pl_rade_reflink: '<a refstr=CALCULATED_VALUE href=/docs/x>Calculated Value</a>' })
    expect(calc.radiusEarth.status).toBe('calculated')
    const mr = normalizeRow({ pl_name: 'A b', hostname: 'A', pl_bmasse: 3, pl_bmassprov: 'M-R relationship' })
    expect(mr.massEarth).toMatchObject({ status: 'estimated', kind: 'M-R' })
    const msini = normalizeRow({ pl_name: 'A b', hostname: 'A', pl_bmasse: 1.07, pl_bmassprov: 'Msini' })
    expect(msini.massEarth).toMatchObject({ status: 'measured', kind: 'Msini' })
  })

  it('records upper and lower limits', () => {
    const p = normalizeRow({ pl_name: 'A b', hostname: 'A', pl_orbeccen: 0.3, pl_orbeccenlim: 1 })
    expect(p.eccentricity.limit).toBe('<')
  })

  it('decodes citation entities and resolves relative URLs', () => {
    const s = parseSource('<a refstr=X href=/docs/pscp_calc.html target=_blank>&Ouml;zt&uuml;rk &amp; Erdem 2019</a>')
    expect(s).toEqual({ label: 'Öztürk & Erdem 2019', url: 'https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html' })
  })

  it('rejects rows without a name or host', () => {
    expect(isValidRow({ pl_name: 'A b', hostname: 'A' })).toBe(true)
    expect(isValidRow({ pl_name: '', hostname: 'A' })).toBe(false)
    expect(isValidRow({ pl_name: 'A b' })).toBe(false)
  })
})
