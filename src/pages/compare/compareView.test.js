import { describe, expect, it } from 'vitest'
import { buildComparison } from '../../science/compare.js'
import {
  formatCell,
  highlightOf,
  highlightWords,
  parseIds,
  ratioText,
  resolveSelection,
  rowNote,
  searchWith,
  sourcesByPlanet,
} from './compareView.js'

describe('URL selection', () => {
  it('parses ids: trimmed, lower-cased, de-duplicated, malformed dropped, order kept', () => {
    expect(parseIds(null)).toEqual([])
    expect(parseIds('')).toEqual([])
    expect(parseIds(' TRAPPIST-1-e , proxima-cen-b,trappist-1-e,,<script>,a b ')).toEqual(['trappist-1-e', 'proxima-cen-b'])
    expect(parseIds(Array.from({ length: 40 }, (_, i) => `p${i}`).join(','))).toHaveLength(20)
  })

  it('compares the first four known planets and reports unknown and extra ones', () => {
    const byId = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [id, { id }]))
    expect(resolveSelection(['x', 'a', 'b', 'c', 'd', 'e'], byId)).toEqual({ ids: ['a', 'b', 'c', 'd'], unknown: ['x'], overflow: ['e'] })
    expect(resolveSelection([], byId)).toEqual({ ids: [], unknown: [], overflow: [] })
  })

  it('writes ids with readable commas and keeps other params', () => {
    const p = new URLSearchParams('earth=0&ids=old')
    expect(searchWith(p, ['a', 'b-2'])).toBe('?earth=0&ids=a,b-2')
    expect(searchWith(p, [])).toBe('?earth=0')
    expect(searchWith(new URLSearchParams('ids=a'), null, { earth: '0' })).toBe('?ids=a&earth=0')
    expect(searchWith(new URLSearchParams('earth=0'), null, { earth: null })).toBe('')
  })
})

describe('formatCell', () => {
  it('rounds to the uncertainty’s precision and keeps the exact catalogue value', () => {
    const f = formatCell({ value: 384.843, err: [0.007, -0.012] })
    expect(f).toMatchObject({ value: '384.8430', plus: '0.0070', minus: '0.0120', exact: null }) // nothing lost
    const r = formatCell({ value: 1.23456, err: [0.1, -0.1] })
    expect(r).toMatchObject({ value: '1.23', exact: '1.23456' }) // rounding is disclosed
  })

  it('shows a catalogue value without uncertainty exactly as catalogued', () => {
    expect(formatCell({ value: 12.42988881, err: null })).toEqual({ value: '12.42988881', exact: null })
    expect(formatCell({ value: 170000 })).toEqual({ value: '170,000', exact: null })
    expect(formatCell({ value: 1e-7 }).value).toBe('1e-7')
  })

  it('gives calculated values without uncertainty 4 significant figures, disclosing the full value', () => {
    expect(formatCell({ value: 0.02925 * (1 - 0.0051) }, { derived: true })).toEqual({ value: '0.0291', exact: '0.029100825' })
  })

  it('returns null for missing values', () => {
    expect(formatCell({ value: null })).toBeNull()
    expect(formatCell(null)).toBeNull()
  })
})

describe('highlights and notes', () => {
  const ranked = (hi, lo, basis = 'direct') => ({ status: 'ranked', basis, highest: { planetId: 'a', separation: hi }, lowest: { planetId: 'b', separation: lo } })
  const row = (ranking) => ({ type: 'quantity', ranking })

  it('highlights only extremes marked distinct', () => {
    expect(highlightOf(ranked('distinct', 'distinct'), 'a')).toBe('high')
    expect(highlightOf(ranked('distinct', 'distinct'), 'b')).toBe('low')
    expect(highlightOf(ranked('overlap', 'unverified'), 'a')).toBeNull()
    expect(highlightOf(ranked('overlap', 'unverified'), 'b')).toBeNull()
    expect(highlightOf({ status: 'notRanked', reason: 'x' }, 'a')).toBeNull()
    expect(highlightOf({ status: 'insufficient' }, 'a')).toBeNull()
  })

  it('names extremes by property', () => {
    expect(highlightWords('distancePc')).toEqual(['Farthest', 'Nearest'])
    expect(highlightWords('star.metallicity')).toEqual(['Highest', 'Lowest'])
  })

  it('explains each row once, briefly', () => {
    expect(rowNote(row(ranked('distinct', 'distinct')))).toBeNull()
    expect(rowNote(row(ranked('overlap', 'overlap')))).toBe('Not highlighted: values overlap within their uncertainties.')
    expect(rowNote(row(ranked('unverified', 'unverified')))).toBe('Not highlighted: not every value has a reported uncertainty.')
    expect(rowNote(row(ranked('distinct', 'overlap')))).toBe('Only the highest value is highlighted; the lowest is not, because values overlap within their uncertainties.')
    expect(rowNote(row(ranked('unverified', 'distinct')))).toMatch(/^Only the lowest value is highlighted/)
    expect(rowNote(row(ranked('overlap', 'unverified')))).toMatch(/overlap.*and not every value/)
    expect(rowNote(row(ranked('distinct', 'distinct', 'estimated')))).toBe('Compared among model-based estimates only.')
    expect(rowNote(row({ status: 'notRanked', reason: 'Not ranked: b has no value' }))).toBe('Not ranked: b has no value')
    expect(rowNote(row({ status: 'insufficient' }))).toBeNull()
    expect(rowNote({ type: 'text' })).toBeNull()
  })

  it('formats Earth ratios as approximate, 3 significant figures', () => {
    expect(ratioText({ value: 0.88910, against: 'Earth' })).toBe('≈ 0.889 × Earth')
    expect(ratioText(null)).toBeNull()
  })
})

describe('sourcesByPlanet', () => {
  it('groups citations per planet with the fields that use them', () => {
    const src = { label: 'Agol et al. 2021', url: 'https://example.org' }
    const p = { id: 'a', name: 'A', radiusEarth: { value: 1, status: 'measured', source: src }, massEarth: { value: 1, status: 'measured', kind: 'Mass', source: src }, star: { teff: { value: 3000, status: 'measured', source: { label: 'Other 2020', url: null } } }, system: {}, discovery: {} }
    const [a] = sourcesByPlanet(buildComparison([p]), [p])
    expect(a.sources).toEqual([
      { ...src, fields: ['radius', 'mass'] },
      { label: 'Other 2020', url: null, fields: ['star effective temperature'] },
    ])
  })
})
