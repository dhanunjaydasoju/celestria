import { describe, expect, it } from 'vitest'
import { provenanceKey } from '../components/data/provenance.js'
import { isScientific, scienceValue } from '../contracts/planet.js'
import { surfaceGravity } from '../science/derived.js'
import { orbitalElements } from '../science/kepler.js'
import { classifySize } from '../three/planet/archetype.js'
import raw from './__fixtures__/raw-41.json'
import {
  IMPUTABLE,
  MEDIAN_LABEL,
  NEVER_IMPUTE,
  analysisValue,
  computeMedianTable,
  imputeCatalog,
  imputedQuantity,
  summarize,
} from './imputation.js'
import { normalizeRow } from './normalize.js'

const M = { value: null, status: 'missing' }
const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(deepFreeze)
  }
  return o
}

/** Synthetic planet with every quantity missing unless overridden. */
function planet(id, fields = {}) {
  return {
    id,
    name: id,
    host: `${id}-star`,
    radiusEarth: M, massEarth: M, densityGcc: M, eqTempK: M, insolationEarth: M,
    periodDays: M, semiMajorAxisAU: M, eccentricity: M, inclinationDeg: M,
    periastronArgDeg: M, periastronTimeJD: M, transitMidJD: M,
    star: { name: `${id}-star`, spectralType: null, teff: M, radiusSun: M, massSun: M, lumLog: M, metallicity: M, ageGyr: M, ...(fields.star ?? {}) },
    discovery: { year: null, method: 'Transit', facility: null, telescope: null },
    system: { distancePc: M, planetCount: null, starCount: null, raDeg: null, decDeg: null, vMag: null },
    flags: { controversial: false, ttv: false },
    ...fields,
    ...(fields.star ? { star: { name: `${id}-star`, spectralType: null, teff: M, radiusSun: M, massSun: M, lumLog: M, metallicity: M, ageGyr: M, ...fields.star } } : {}),
  }
}

// 25 sub-Neptunes with masses (radius 2–3.9 R⊕) + 25 giants, + targets.
function population() {
  const ps = []
  for (let i = 0; i < 25; i++) ps.push(planet(`sn${i}`, { radiusEarth: q(2 + i * 0.08), massEarth: q(4 + i * 0.4, 'measured', { kind: 'Mass' }), periodDays: q(5 + i) }))
  for (let i = 0; i < 25; i++) ps.push(planet(`gj${i}`, { radiusEarth: q(10 + i * 0.1), massEarth: q(200 + i * 10, 'measured', { kind: 'Mass' }), periodDays: q(3 + i) }))
  return ps
}

describe('canonical data is never modified', () => {
  const planets = deepFreeze([...population(), planet('target', { radiusEarth: q(3), periodDays: q(12) })])

  it('runs on frozen input (any write would throw) and leaves missing values missing', () => {
    const { imputations } = imputeCatalog(planets, { catalogVersion: 'test' })
    const target = planets.find((p) => p.id === 'target')
    expect(target.massEarth).toEqual(M)
    expect(imputations.target.massEarth.value).toBeGreaterThan(0)
  })

  it('does so for the real 41-planet regression set too', () => {
    const real = deepFreeze(raw.rows.map(normalizeRow))
    const before = JSON.stringify(real)
    imputeCatalog(real, { catalogVersion: 'test' })
    expect(JSON.stringify(real)).toBe(before)
  })
})

describe('imputed entries are labelled and traceable', () => {
  it('carries method, label, group, fallback level, group size, IQR and version', () => {
    const { imputations } = imputeCatalog([...population(), planet('target', { radiusEarth: q(3), periodDays: q(12) })], { catalogVersion: 'v1' })
    expect(imputations.target.massEarth).toMatchObject({
      method: 'median',
      label: MEDIAN_LABEL,
      group: 'radius 1.6–4 R⊕',
      groupLevel: 'radius bin',
      fallbackDepth: 0,
      groupSize: 25,
      catalogVersion: 'v1',
    })
    expect(imputations.target.massEarth.iqr).toHaveLength(2)
    expect(Object.isFrozen(imputations.target.massEarth)).toBe(true)
  })

  it('uses the grouped median, not the global one', () => {
    const { imputations, table } = imputeCatalog([...population(), planet('target', { radiusEarth: q(3) })])
    expect(imputations.target.massEarth.value).toBeCloseTo(8.8, 6) // median of 4…13.6
    expect(table.massEarth.global.median).not.toBeCloseTo(8.8, 1)
  })

  it('falls back to a broader group when the specific group is too small, and records it', () => {
    const ps = [...population(), planet('earthlike', { radiusEarth: q(1) })] // no ≤1.6 R⊕ group exists
    const e = imputeCatalog(ps).imputations.earthlike.massEarth
    expect(e.groupLevel).toBe('discovery method')
    expect(e.fallbackDepth).toBe(1)
  })
})

describe('only valid source values feed medians', () => {
  it('excludes missing, limits, model estimates, minimum masses and fixed-zero eccentricities', () => {
    const ps = [
      planet('a', { massEarth: q(10, 'measured', { kind: 'Mass' }) }),
      planet('b', { massEarth: q(1000, 'estimated', { kind: 'M-R' }) }),
      planet('c', { massEarth: q(1000, 'measured', { kind: 'Msini' }) }),
      planet('d', { massEarth: q(1000, 'measured', { kind: 'Mass', limit: '<' }) }),
      planet('e', { eccentricity: q(0) }), // fixed at 0: no uncertainty
      planet('f', { eccentricity: q(0.2, 'measured', { err: [0.01, -0.01] }) }),
    ]
    const t = computeMedianTable(ps)
    expect(t.massEarth.global).toMatchObject({ median: 10, n: 1 })
    expect(t.eccentricity.global).toMatchObject({ median: 0.2, n: 1 })
  })

  it('never chains: imputed values are not inputs to later medians', () => {
    const ps = [...population(), planet('t1', { radiusEarth: q(3) }), planet('t2', { radiusEarth: q(3) })]
    const first = imputeCatalog(ps)
    // Both targets draw on the same 25 measured masses; t1's imputed value
    // does not become an input for t2, and a second run is identical.
    expect(first.imputations.t1.massEarth.groupSize).toBe(25)
    expect(first.imputations.t2.massEarth.groupSize).toBe(25)
    expect(imputeCatalog(ps).table).toEqual(first.table)
    expect(computeMedianTable(ps).massEarth.levels[0].groups['radius 1.6–4 R⊕'].n).toBe(25)
  })

  it('computes medians and IQR correctly', () => {
    expect(summarize([5, 1, 3])).toEqual({ median: 3, iqr: [2, 4], n: 3 })
    expect(summarize([])).toBeNull()
  })
})

describe('physics wins over medians', () => {
  it('calculates Teq, insolation and density from measured inputs and labels them Calculated', () => {
    const p = planet('phys', {
      semiMajorAxisAU: q(1),
      radiusEarth: q(1),
      massEarth: q(1, 'measured', { kind: 'Mass' }),
      star: { teff: q(5772), radiusSun: q(1), lumLog: q(0) },
    })
    const { imputations } = imputeCatalog([...population(), p])
    expect(imputations.phys.eqTempK).toMatchObject({ method: 'calculated', label: 'Calculated' })
    expect(imputations.phys.eqTempK.value).toBeCloseTo(278.6, 0) // Earth-like, zero albedo
    expect(imputations.phys.insolationEarth.value).toBeCloseTo(1, 6)
    expect(imputations.phys.densityGcc.value).toBeCloseTo(5.514, 3)
  })
})

describe('bias-reducing fallbacks', () => {
  it('derives Teq from insolation (and back) before using any median', () => {
    const { imputations } = imputeCatalog([...population(), planet('hot', { insolationEarth: q(16) }), planet('warm', { eqTempK: q(557.2) })])
    expect(imputations.hot.eqTempK).toMatchObject({ method: 'calculated' })
    expect(imputations.hot.eqTempK.value).toBeCloseTo(557.2, 0) // 278.6 · 16^¼
    expect(imputations.warm.insolationEarth.value).toBeCloseTo(16, 1)
  })

  it('groups a star without spectral type by stellar mass before the global median', () => {
    const stars = []
    for (let i = 0; i < 25; i++) stars.push(planet(`m${i}`, { star: { massSun: q(0.2 + i * 0.005), teff: q(3200 + i * 10) } }))
    for (let i = 0; i < 25; i++) stars.push(planet(`g${i}`, { star: { massSun: q(0.9 + i * 0.005), teff: q(5600 + i * 10) } }))
    const { imputations } = imputeCatalog([...stars, planet('reddwarf', { star: { massSun: q(0.25) } })])
    const e = imputations.reddwarf['star.teff']
    expect(e.groupLevel).toBe('star mass bin')
    expect(e.value).toBeLessThan(3500) // a global median (~4400 K here) would misrepresent an M dwarf
  })
})

describe('forbidden fields are never imputed', () => {
  it('has no imputable field on the never-impute list and never groups by the field itself', () => {
    for (const f of NEVER_IMPUTE) expect(IMPUTABLE[f], f).toBeUndefined()
  })

  it('never emits identifiers, period, orbit geometry, timing or discovery fields', () => {
    const real = raw.rows.map(normalizeRow)
    const sparse = planet('sparse')
    const { imputations } = imputeCatalog([...real, ...population(), sparse])
    const emitted = new Set(Object.values(imputations).flatMap((e) => Object.keys(e)))
    for (const f of NEVER_IMPUTE) expect(emitted.has(f), f).toBe(false)
    for (const f of emitted) expect(Object.keys(IMPUTABLE)).toContain(f)
  })
})

describe('imputed values are never mistaken for NASA measurements', () => {
  const { imputations } = imputeCatalog([...population(), planet('target', { radiusEarth: q(3), periodDays: q(12) })])
  const asQuantity = imputedQuantity(imputations.target.massEarth)

  it('is rejected by the science accessors', () => {
    expect(asQuantity.status).toBe('imputed')
    expect(isScientific(asQuantity)).toBe(false)
    expect(scienceValue(asQuantity)).toBeNull()
  })

  it('renders as Unavailable by default; only an explicit opt-in shows the imputed label', () => {
    expect(provenanceKey(asQuantity)).toBe('missing')
    expect(provenanceKey(asQuantity, { allowImputed: true })).toBe('imputed')
    expect(provenanceKey(q(5))).toBe('measured')
  })

  it('is ignored by orbital physics, gravity and visual classification', () => {
    const p = planet('orbit', {
      periodDays: q(10),
      semiMajorAxisAU: q(0.1),
      star: { massSun: q(1) },
      eccentricity: imputedQuantity({ value: 0.3, method: 'median', groupSize: 30, group: 'x' }),
      radiusEarth: imputedQuantity({ value: 1, method: 'median', groupSize: 30, group: 'x' }),
      massEarth: { ...imputedQuantity({ value: 1, method: 'median', groupSize: 30, group: 'x' }), kind: 'Mass' },
    })
    expect(orbitalElements(p).eStatus).toBe('missing')
    expect(orbitalElements(p).e).toBe(0)
    expect(surfaceGravity(p)).toBeNull()
    expect(classifySize(p).type).toBe('unclassified')
  })

  it('analysisValue always reports provenance so consumers can weight or exclude', () => {
    const p = planet('target', { radiusEarth: q(3), periodDays: q(12) })
    expect(analysisValue(p, 'radiusEarth', imputations)).toEqual({ value: 3, provenance: 'measured', imputed: false })
    expect(analysisValue(p, 'massEarth', imputations)).toMatchObject({ provenance: 'imputed', imputed: true })
    expect(analysisValue(planet('none'), 'massEarth', {})).toEqual({ value: null, provenance: 'missing', imputed: false })
  })
})
