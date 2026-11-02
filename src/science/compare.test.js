import { describe, expect, it } from 'vitest'
import { labPlanets } from '../three/lab/fixtures.js'
import {
  COMPARE_GROUPS,
  MAX_COMPARE_PLANETS,
  buildComparison,
  compareCell,
  findRow,
  interval,
  rankRow,
  separation,
} from './compare.js'

const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })
const MISSING = { value: null, status: 'missing' }

/** Minimal planet; every field missing unless given. */
function planet(id, fields = {}) {
  const { star = {}, system = {}, discovery = {}, ...rest } = fields
  return {
    id,
    name: id.toUpperCase(),
    host: `${id}-host`,
    radiusEarth: MISSING,
    massEarth: MISSING,
    densityGcc: MISSING,
    eqTempK: MISSING,
    insolationEarth: MISSING,
    periodDays: MISSING,
    semiMajorAxisAU: MISSING,
    eccentricity: MISSING,
    inclinationDeg: MISSING,
    periastronArgDeg: MISSING,
    periastronTimeJD: MISSING,
    transitMidJD: MISSING,
    star: { name: `${id}-host`, spectralType: null, teff: MISSING, radiusSun: MISSING, massSun: MISSING, lumLog: MISSING, metallicity: MISSING, ageGyr: MISSING, ...star },
    discovery: { year: null, method: 'Transit', facility: null, telescope: null, ...discovery },
    system: { distancePc: MISSING, planetCount: 1, starCount: 1, raDeg: null, decDeg: null, vMag: null, ...system },
    flags: { controversial: false, ttv: false },
    ...rest,
  }
}

const field = (key) => COMPARE_GROUPS.flatMap((g) => g.fields).find((f) => f.key === key)
const row = (planets, key, opts) => findRow(buildComparison(planets, opts), key)

describe('interval', () => {
  it('normalises [+upper, −lower] into [low, high]', () => {
    expect(interval({ value: 1, err: [0.1, -0.2] })).toEqual([0.8, 1.1])
    expect(interval({ value: 1, err: [0.1, 0.2] })).toEqual([0.8, 1.1]) // sign-tolerant
  })

  it('is null when the uncertainty is unknown, partial or a reported ±0', () => {
    expect(interval({ value: 1 })).toBeNull()
    expect(interval({ value: 1, err: null })).toBeNull()
    expect(interval({ value: 1, err: [0.1, Number.NaN] })).toBeNull()
    expect(interval({ value: 1, err: [0, 0] })).toBeNull()
    expect(interval({ value: null, err: [0.1, -0.1] })).toBeNull()
  })

  it('accepts a one-sided zero', () => {
    expect(interval({ value: 0.02, err: [0.03, 0] })).toEqual([0.02, 0.05])
  })
})

describe('compareCell', () => {
  it('keeps value, uncertainty, provenance and source', () => {
    const src = { label: 'Agol et al. 2021', url: 'https://example.org' }
    const c = compareCell(planet('a', { radiusEarth: q(0.92, 'measured', { err: [0.013, -0.012], source: src }) }), field('radiusEarth'))
    expect(c).toMatchObject({ planetId: 'a', value: 0.92, err: [0.013, -0.012], kind: 'measured', status: 'measured', evidence: 'direct', rankable: true, reason: null, source: src })
    expect(Object.isFrozen(c)).toBe(true)
  })

  it('marks NASA-calculated values as calculated, still directly comparable', () => {
    const c = compareCell(planet('a', { radiusEarth: q(1.3, 'calculated') }), field('radiusEarth'))
    expect(c).toMatchObject({ kind: 'calculated', evidence: 'direct', rankable: true })
  })

  it('keeps missing values null with a reason, never 0', () => {
    const c = compareCell(planet('a'), field('radiusEarth'))
    expect(c).toMatchObject({ value: null, kind: 'missing', rankable: false, earthRatio: null })
    expect(c.reason).toMatch(/Not available/)
  })

  it('never uses imputed values', () => {
    const c = compareCell(planet('a', { radiusEarth: q(2.1, 'imputed') }), field('radiusEarth'))
    expect(c.value).toBeNull()
    expect(c.kind).toBe('missing')
    expect(c.earthRatio).toBeNull()
  })

  it('keeps the mass kind: true, minimum (M sin i) and mass–radius estimate', () => {
    const m = (kind, status = 'measured') => compareCell(planet('a', { massEarth: q(5, status, { kind }) }), field('massEarth'))
    expect(m('Mass')).toMatchObject({ kind: 'measured', massKind: 'Mass', evidence: 'direct' })
    expect(m('Msini')).toMatchObject({ kind: 'minimum', massKind: 'Msini', evidence: 'minimum' })
    expect(m('M-R', 'estimated')).toMatchObject({ kind: 'estimated', massKind: 'M-R', evidence: 'estimated' })
  })

  it('keeps upper and lower limits and refuses to rank them', () => {
    const up = compareCell(planet('a', { massEarth: q(3, 'measured', { kind: 'Mass', limit: '<' }) }), field('massEarth'))
    expect(up).toMatchObject({ limit: '<', rankable: false, earthRatio: null })
    expect(up.reason).toBe('Only an upper limit is known')
    const low = compareCell(planet('a', { eqTempK: q(900, 'measured', { limit: '>' }) }), field('eqTempK'))
    expect(low.reason).toBe('Only a lower limit is known')
  })

  it('treats an eccentricity fixed at 0 as assumed, not measured', () => {
    const c = compareCell(planet('a', { eccentricity: q(0) }), field('eccentricity'))
    expect(c).toMatchObject({ kind: 'assumed', rankable: false })
    const measured = compareCell(planet('a', { eccentricity: q(0, 'measured', { err: [0.02, 0] }) }), field('eccentricity'))
    expect(measured).toMatchObject({ kind: 'measured', rankable: true })
  })

  it('flags model-based masses and radii of directly imaged planets as estimates', () => {
    const imaged = planet('a', { radiusEarth: q(13), massEarth: q(2000, 'measured', { kind: 'Mass' }), discovery: { method: 'Imaging' } })
    expect(compareCell(imaged, field('radiusEarth'))).toMatchObject({ kind: 'measured', modelBased: true, evidence: 'estimated' })
    expect(compareCell(imaged, field('massEarth')).evidence).toBe('estimated')
    expect(compareCell(imaged, field('periodDays')).modelBased).toBeUndefined() // only mass/size fields
  })

  it('explains why a derived value is unavailable', () => {
    const p = planet('a', { massEarth: q(1, 'measured', { kind: 'Msini' }), radiusEarth: q(1) })
    expect(compareCell(p, field('surfaceGravity')).reason).toMatch(/measured true mass/)
    expect(compareCell(planet('a', { eccentricity: q(0), semiMajorAxisAU: q(1) }), field('periastron')).reason).toMatch(/fixed at 0/)
    expect(compareCell(planet('a', { semiMajorAxisAU: q(1) }), field('periastron')).reason).toMatch(/eccentricity/)
  })

  it('uses derived values with their calculated status and propagated uncertainty', () => {
    const p = planet('a', { massEarth: q(1, 'measured', { kind: 'Mass', err: [0.1, -0.1] }), radiusEarth: q(1, 'measured', { err: [0.05, -0.05] }) })
    const g = compareCell(p, field('surfaceGravity'))
    expect(g).toMatchObject({ kind: 'calculated', evidence: 'direct', rankable: true })
    expect(g.value).toBeCloseTo(9.80665)
    expect(interval(g)).not.toBeNull()
  })
})

describe('Earth ratios', () => {
  it('divides by the Earth reference and scales the uncertainty', () => {
    const c = compareCell(planet('a', { densityGcc: q(11.026, 'measured', { err: [0.5513, -1.1026] }) }), field('densityGcc'))
    expect(c.earthRatio.value).toBeCloseTo(2)
    expect(c.earthRatio.err[0]).toBeCloseTo(0.1)
    expect(c.earthRatio.err[1]).toBeCloseTo(-0.2)
    expect(c.earthRatio).toMatchObject({ status: 'calculated', against: 'Earth' })
    expect(c.earthRatio.basis).toBe("Density ÷ Earth's 5.513 g/cm³")
  })

  it('uses the sidereal year and the Sun for stellar fields', () => {
    expect(compareCell(planet('a', { periodDays: q(730.512) }), field('periodDays')).earthRatio.value).toBeCloseTo(2)
    const s = compareCell(planet('a', { star: { massSun: q(0.0898) } }), field('star.massSun'))
    expect(s.earthRatio).toMatchObject({ value: 0.0898, against: 'Sun' })
  })

  it('keeps minimum-mass and estimate labels on the ratio', () => {
    expect(compareCell(planet('a', { massEarth: q(1.07, 'measured', { kind: 'Msini' }) }), field('massEarth')).earthRatio.kind).toBe('minimum')
    expect(compareCell(planet('a', { massEarth: q(3.3, 'estimated', { kind: 'M-R' }) }), field('massEarth')).earthRatio.estimated).toBe(true)
  })

  it('gives no ratio for missing, limit, assumed or reference-less fields', () => {
    expect(compareCell(planet('a'), field('periodDays')).earthRatio).toBeNull()
    expect(compareCell(planet('a', { radiusEarth: q(2, 'measured', { limit: '<' }) }), field('radiusEarth')).earthRatio).toBeNull()
    expect(compareCell(planet('a', { eqTempK: q(300) }), field('eqTempK')).earthRatio).toBeNull() // temperature ratios are not meaningful
    expect(compareCell(planet('a', { system: { distancePc: q(12) } }), field('distancePc')).earthRatio).toBeNull()
  })
})

describe('separation (uncertainty overlap)', () => {
  const c = (value, err) => ({ value, err: err ?? null })

  it('is distinct only when every range is known and none overlaps', () => {
    expect(separation(c(2, [0.1, -0.1]), [c(1, [0.1, -0.1])], 'high')).toBe('distinct')
    expect(separation(c(1, [0.1, -0.1]), [c(2, [0.1, -0.1])], 'low')).toBe('distinct')
  })

  it('reports overlapping ranges as overlap', () => {
    expect(separation(c(1.2, [0.1, -0.15]), [c(1.0, [0.1, -0.1])], 'high')).toBe('overlap')
    expect(separation(c(1.0, [0.1, -0.1]), [c(1.15, [0.1, -0.06])], 'low')).toBe('overlap')
  })

  it('treats touching ranges and ties as overlap', () => {
    expect(separation(c(2, [0.5, -0.5]), [c(1, [0.5, -0.5])], 'high')).toBe('overlap')
    expect(separation(c(1), [c(1)], 'high')).toBe('overlap')
  })

  it('never calls a difference clear when an uncertainty is unknown', () => {
    expect(separation(c(100), [c(1, [0.1, -0.1])], 'high')).toBe('unverified')
    expect(separation(c(100, [1, -1]), [c(1)], 'high')).toBe('unverified')
  })

  it('still detects overlap from a known range against a bare value', () => {
    expect(separation(c(1.0), [c(0.9, [0.2, -0.2])], 'high')).toBe('overlap')
  })

  it('checks the target against every other planet', () => {
    const others = [c(1, [0.1, -0.1]), c(1.9, [0.2, -0.2])]
    expect(separation(c(2, [0.05, -0.05]), others, 'high')).toBe('overlap')
  })
})

describe('rankRow', () => {
  const e = (name, cell) => ({ name, cell: { planetId: name, evidence: 'direct', rankable: true, kind: 'measured', err: null, ...cell } })

  it('needs at least two planets', () => {
    expect(rankRow([e('a', { value: 1 })]).status).toBe('insufficient')
    expect(rankRow([]).status).toBe('insufficient')
  })

  it('ranks comparable values and reports each extreme’s separation', () => {
    const r = rankRow([e('a', { value: 1, err: [0.1, -0.1] }), e('b', { value: 3, err: [0.1, -0.1] }), e('c', { value: 2.95, err: [0.1, -0.1] })])
    expect(r).toMatchObject({ status: 'ranked', basis: 'direct', highest: { planetId: 'b', separation: 'overlap' }, lowest: { planetId: 'a', separation: 'distinct' } })
  })

  it('never ranks a row with a missing value', () => {
    const r = rankRow([e('a', { value: 1 }), e('b', { value: null, kind: 'missing', rankable: false, evidence: null })])
    expect(r).toEqual({ status: 'notRanked', reason: 'Not ranked: b has no value' })
  })

  it('never ranks a row containing a limit or an assumed value', () => {
    expect(rankRow([e('a', { value: 1 }), e('b', { value: 5, limit: '<', rankable: false })]).reason).toBe('Not ranked: b has only an upper limit')
    expect(rankRow([e('a', { value: 1 }), e('b', { value: 5, limit: '>', rankable: false })]).reason).toBe('Not ranked: b has only a lower limit')
    expect(rankRow([e('a', { value: 0.1 }), e('b', { value: 0, kind: 'assumed', rankable: false })]).reason).toBe('Not ranked: b has an assumed value')
  })

  it('never ranks minimum masses, alone or mixed', () => {
    const only = rankRow([e('a', { value: 1, evidence: 'minimum' }), e('b', { value: 300, evidence: 'minimum' })])
    expect(only.status).toBe('notRanked')
    expect(only.reason).toMatch(/unknown orbital tilt/)
    expect(rankRow([e('a', { value: 1, evidence: 'minimum' }), e('b', { value: 300 })]).reason).toBe('Not ranked: mixes minimum masses (M sin i) with other masses')
  })

  it('never ranks model estimates against measurements, but ranks estimates among themselves', () => {
    expect(rankRow([e('a', { value: 1, evidence: 'estimated' }), e('b', { value: 3 })]).reason).toBe('Not ranked: mixes model-based estimates with measured values')
    const est = rankRow([e('a', { value: 1, evidence: 'estimated' }), e('b', { value: 3, evidence: 'estimated' })])
    expect(est).toMatchObject({ status: 'ranked', basis: 'estimated' })
  })

  it('is deterministic for ties (first planet wins, separation overlap)', () => {
    const r = rankRow([e('a', { value: 2 }), e('b', { value: 2 })])
    expect(r.highest).toEqual({ planetId: 'a', separation: 'overlap' })
    expect(r.lowest).toEqual({ planetId: 'a', separation: 'overlap' })
  })
})

describe('buildComparison', () => {
  const earthLike = planet('earthlike', {
    radiusEarth: q(0.92, 'measured', { err: [0.013, -0.012] }),
    massEarth: q(0.69, 'measured', { kind: 'Mass', err: [0.02, -0.02] }),
    periodDays: q(6.1, 'measured', { err: [0.001, -0.001] }),
  })
  const giant = planet('giant', {
    radiusEarth: q(13.4, 'measured', { err: [0.4, -0.4] }),
    massEarth: q(150, 'measured', { kind: 'Mass', err: [5, -5] }),
    periodDays: q(3.5, 'measured', { err: [0.001, -0.001] }),
  })

  it('groups rows as planet basics, physical, orbital, host star, discovery and system', () => {
    const cmp = buildComparison([earthLike, giant])
    expect(cmp.groups.map((g) => g.key)).toEqual(['basics', 'physical', 'orbital', 'star', 'discovery'])
    expect(cmp.planetIds).toEqual(['earthlike', 'giant'])
    expect(cmp.notes.join(' ')).toMatch(/Composite Parameters/)
    expect(cmp.notes.join(' ')).toMatch(/reference values/)
  })

  it('keeps planet order in every row', () => {
    for (const g of buildComparison([giant, earthLike]).groups) for (const r of g.rows) expect(r.cells.map((c) => c.planetId)).toEqual(['giant', 'earthlike'])
  })

  it('ranks clearly different measured values', () => {
    const r = row([earthLike, giant], 'radiusEarth')
    expect(r.ranking).toMatchObject({ status: 'ranked', highest: { planetId: 'giant', separation: 'distinct' }, lowest: { planetId: 'earthlike', separation: 'distinct' } })
    expect(r.unit).toBe('R⊕')
  })

  it('adds the Earth reference column, never as a ranked planet', () => {
    const r = row([earthLike, giant], 'radiusEarth')
    expect(r.earth).toMatchObject({ value: 1, status: 'reference', kind: 'reference' })
    expect(r.cells).toHaveLength(2)
    expect(row([earthLike, giant], 'star.teff').earth.value).toBe(5772)
    expect(row([earthLike, giant], 'name').earth.value).toBe('Earth')
    expect(row([earthLike, giant], 'star.spectralType').earth.value).toBe('G2 V')
    expect(row([earthLike, giant], 'inclinationDeg').earth).toBeNull()
    expect(row([earthLike, giant], 'discovery.year').earth).toBeNull()
  })

  it('can leave Earth out', () => {
    expect(row([earthLike, giant], 'radiusEarth', { includeEarth: false }).earth).toBeNull()
  })

  it('handles one or no planets without ranking', () => {
    expect(row([earthLike], 'radiusEarth').ranking.status).toBe('insufficient')
    const empty = buildComparison([])
    expect(empty.planetIds).toEqual([])
    expect(findRow(empty, 'radiusEarth').cells).toEqual([])
  })

  it('drops duplicates and null entries, and refuses more than four planets', () => {
    expect(buildComparison([earthLike, null, earthLike, giant]).planetIds).toEqual(['earthlike', 'giant'])
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => planet(id))
    expect(MAX_COMPARE_PLANETS).toBe(4)
    expect(() => buildComparison(five)).toThrow(RangeError)
  })

  it('shows missing text facts as missing, not empty strings', () => {
    const r = row([earthLike, giant], 'discovery.facility')
    expect(r.cells.every((c) => c.value === null && c.kind === 'missing')).toBe(true)
    expect(r.type).toBe('text')
    expect(r.ranking).toBeUndefined()
  })

  it('does not rank masses when one is a minimum mass', () => {
    const rv = planet('rv', { massEarth: q(300, 'measured', { kind: 'Msini', err: [10, -10] }) })
    expect(row([earthLike, rv], 'massEarth').ranking.status).toBe('notRanked')
  })

  it('does not rank masses when one is a mass–radius estimate', () => {
    const est = planet('est', { massEarth: q(3.3, 'estimated', { kind: 'M-R' }) })
    expect(row([earthLike, est], 'massEarth').ranking.reason).toMatch(/model-based estimates/)
  })

  it('reports overlapping uncertainties instead of a winner', () => {
    const twin = planet('twin', { radiusEarth: q(0.93, 'measured', { err: [0.02, -0.02] }) })
    const r = row([earthLike, twin], 'radiusEarth')
    expect(r.ranking.status).toBe('ranked')
    expect(r.ranking.highest.separation).toBe('overlap')
    expect(r.ranking.lowest.separation).toBe('overlap')
  })

  it('does not invent a value anywhere for an all-missing planet', () => {
    const sparse = planet('sparse')
    const cmp = buildComparison([sparse, earthLike])
    for (const g of cmp.groups) {
      for (const r of g.rows) {
        if (r.type !== 'quantity') continue
        expect(r.cells[0].value, r.key).toBeNull()
        expect(r.cells[0].earthRatio, r.key).toBeNull()
        expect(r.ranking.status, r.key).toBe('notRanked')
      }
    }
  })

  it('is deterministic and does not modify the planets', () => {
    const input = structuredClone([earthLike, giant])
    const a = buildComparison(input)
    const b = buildComparison(input)
    expect(a).toEqual(b)
    expect(input).toEqual([earthLike, giant])
  })

  it('runs on every lab fixture planet without inventing values', () => {
    const cmp = buildComparison(labPlanets.slice(0, 4))
    for (const g of cmp.groups) {
      for (const r of g.rows) {
        if (r.type !== 'quantity') continue
        r.cells.forEach((c, i) => {
          const p = labPlanets[i]
          if (c.value == null) expect(c.kind).toBe('missing')
          if (c.kind === 'minimum') expect(p.massEarth.kind).toBe('Msini')
        })
      }
    }
    for (let i = 0; i < labPlanets.length; i += 4) expect(() => buildComparison(labPlanets.slice(i, i + 4))).not.toThrow()
  })
})
