import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { readSnapshot } from '../../nasa/snapshot.js'
import { FIXTURE_PLANETS } from '../__fixtures__/planets.js'
import { canonicalName, findMentions, resolveHost, resolvePlanet } from './catalog.js'
import { formatPlanet, formatQuantity } from './format.js'
import { createToolContext, MAX_RESULT_CHARS, runTool, TOOL_DEFINITIONS, TOOL_NAMES } from './index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const NOW = new Date('2026-10-31T00:00:00Z')
const fx = createToolContext(FIXTURE_PLANETS, { meta: { retrievedAt: '2026-10-31T00:00:00Z' }, now: () => NOW })
const call = (name, args, ctx = fx) => runTool(ctx, name, args).result

let real
beforeAll(async () => {
  const snap = await readSnapshot(path.join(here, '../../data/catalog.snapshot.json.gz'))
  real = createToolContext(snap.planets, { meta: snap.meta, now: () => NOW })
})

const deepFind = (node, pred, out = []) => {
  if (node && typeof node === 'object') {
    if (pred(node)) out.push(node)
    Object.values(node).forEach((v) => deepFind(v, pred, out))
  }
  return out
}

describe('formatQuantity: provenance is preserved, never invented', () => {
  it('keeps measured values with asymmetric uncertainty and source', () => {
    const q = formatQuantity(FIXTURE_PLANETS[0].radiusEarth, 'radiusEarth')
    expect(q).toMatchObject({ value: 1.1, unit: 'R⊕', status: 'measured', uncertainty: { plus: 0.05, minus: 0.03 }, source: { label: 'Doe et al. 2020' } })
    expect(q.display).toBe('1.100 +0.050 −0.030 R⊕')
  })

  it('reports missing and imputed values as unavailable, without a value', () => {
    expect(formatQuantity(FIXTURE_PLANETS[1].radiusEarth, 'radiusEarth')).toEqual({ status: 'unavailable', unit: 'R⊕', display: 'Unavailable' })
    const imputed = formatQuantity(FIXTURE_PLANETS[1].eqTempK, 'eqTempK')
    expect(imputed.status).toBe('unavailable')
    expect(imputed).not.toHaveProperty('value')
  })

  it('labels M sin i as minimum, mass–radius as estimated, e = 0 without error as assumed, and limits', () => {
    expect(formatQuantity(FIXTURE_PLANETS[1].massEarth, 'massEarth')).toMatchObject({ status: 'minimum', note: expect.stringMatching(/M sin i/) })
    expect(formatQuantity(FIXTURE_PLANETS[2].massEarth, 'massEarth')).toMatchObject({ status: 'estimated', note: expect.stringMatching(/mass–radius/) })
    expect(formatQuantity(FIXTURE_PLANETS[1].eccentricity, 'eccentricity')).toMatchObject({ value: 0, status: 'assumed' })
    expect(formatQuantity(FIXTURE_PLANETS[2].insolationEarth, 'insolationEarth')).toMatchObject({ limit: 'upper limit', display: '< 3 S⊕' })
  })
})

describe('formatPlanet', () => {
  it('includes links, sources, derived values with their basis, and the unavailable list', () => {
    const p = formatPlanet(FIXTURE_PLANETS[0])
    expect(p.links).toEqual({
      profileUrl: '/planet/testa-b',
      viewportUrl: '/viewport/testa-b',
      systemUrl: '/explore/Testa',
      orbitUrl: '/planet/testa-b/orbit',
      nasaOverviewUrl: 'https://exoplanetarchive.ipac.caltech.edu/overview/Testa%20b',
    })
    expect(p.sources.map((s) => s.label).sort()).toEqual(['Doe et al. 2020', 'Roe & Poe 2022'])
    expect(p.derived.surfaceGravity).toMatchObject({ status: 'calculated', unit: 'm/s²', basis: expect.stringMatching(/G·M\/R²/) })
    expect(p.derived.surfaceGravity.value).toBeCloseTo((1.3 / 1.1 ** 2) * 9.80665, 4)
    expect(p.derived.massJupiter).toMatchObject({ status: 'measured', unit: 'M_J' }) // unit conversion keeps provenance
    expect(p.derived.periastronAU.value).toBeCloseTo(0.045, 6)
    expect(p.unavailable).toEqual(expect.arrayContaining(['Star metallicity', 'Star age', 'Atmosphere composition (not in the NASA catalogue)']))
    expect(p.type.caveat).toMatch(/not a measured composition/)
  })

  it('derives nothing from minimum masses or assumed eccentricity', () => {
    const p = formatPlanet(FIXTURE_PLANETS[1])
    expect(p.derived.surfaceGravity).toBeUndefined()
    expect(p.derived.periastronAU).toBeUndefined()
    expect(p.derived.massJupiter.status).toBe('minimum')
    expect(p.planet.eqTempK.status).toBe('unavailable')
    expect(p.unavailable).toContain('Equilibrium temperature')
  })

  it('never emits an imputed value for any planet in the real catalogue', () => {
    for (const planet of real.planets) {
      const out = formatPlanet(planet)
      expect(deepFind(out, (n) => n.status === 'imputed')).toEqual([])
    }
  })
})

describe('name resolution', () => {
  it('resolves exact names, ids, case and spacing variants', () => {
    expect(resolvePlanet(real, 'TRAPPIST-1 e').planet.name).toBe('TRAPPIST-1 e')
    expect(resolvePlanet(real, 'trappist-1-e').planet.name).toBe('TRAPPIST-1 e')
    expect(resolvePlanet(real, 'trappist 1e').planet.name).toBe('TRAPPIST-1 e')
  })

  it('expands Greek letters, constellation genitives and common aliases', () => {
    expect(resolvePlanet(real, 'Proxima Centauri b').planet.name).toBe('Proxima Cen b')
    expect(resolvePlanet(real, '55 Cancri e').planet.name).toBe('55 Cnc e')
    expect(resolvePlanet(real, 'upsilon Andromedae b').planet.name).toBe('ups And b')
    expect(resolvePlanet(real, 'Kepler-90 b')).toMatchObject({ status: 'found', resolvedFrom: 'alias of KOI-351' })
    expect(canonicalName('Tau Boötis b')).toBe('tau boo b')
  })

  it('resolves a host with one planet, but returns candidates for a multi-planet host', () => {
    const one = resolvePlanet(real, 'HD 189733')
    expect(one).toMatchObject({ status: 'found', resolvedFrom: expect.stringMatching(/only one planet/) })
    const many = resolvePlanet(real, 'TRAPPIST-1')
    expect(many.status).toBe('ambiguous')
    expect(many.candidates).toHaveLength(7)
    expect(many.candidates[0]).toHaveProperty('profileUrl')
  })

  it('suggests close names for typos without choosing one', () => {
    const r = resolvePlanet(real, 'Trapist-1 e')
    expect(r.status).toBe('not_found')
    expect(r.suggestions[0].name).toBe('TRAPPIST-1 e')
    expect(resolvePlanet(real, 'Zorblax Prime')).toEqual({ status: 'not_found', suggestions: [] })
    expect(resolvePlanet(real, '')).toEqual({ status: 'not_found', suggestions: [] })
  })

  it('resolves systems by host, alias or planet name', () => {
    expect(resolveHost(real, 'Kepler-90')).toEqual({ status: 'found', host: 'KOI-351' })
    expect(resolveHost(real, 'TRAPPIST-1 e')).toMatchObject({ status: 'found', host: 'TRAPPIST-1' })
    expect(resolveHost(real, 'Nowhere-999').status).toBe('not_found')
  })

  it('finds planets and systems mentioned in free text', () => {
    const m = findMentions(real, 'How does TRAPPIST-1 e compare with Proxima Centauri b and the Kepler-90 system?')
    expect(m.planets.map((p) => p.name).sort()).toEqual(['Proxima Cen b', 'TRAPPIST-1 e'])
    expect(m.hosts).toContain('KOI-351')
    expect(findMentions(real, 'Tell me about small temperate planets')).toEqual({ planets: [], hosts: [] })
  })
})

describe('search_planets', () => {
  it('finds planets without a name, stating the criteria applied', () => {
    const r = call('search_planets', { presets: ['earth_size', 'temperate'] }, real)
    expect(r.status).toBe('ok')
    expect(r.criteria).toEqual(expect.arrayContaining(['earth_size: radius 0.8–1.25 R⊕', 'temperate: equilibrium temperature 180–310 K']))
    for (const p of r.planets) {
      expect(p.radiusEarth.value).toBeGreaterThanOrEqual(0.8)
      expect(p.radiusEarth.value).toBeLessThanOrEqual(1.25)
      expect(p.eqTempK.value).toBeGreaterThanOrEqual(180)
      expect(p.profileUrl).toBe(`/planet/${p.id}`)
    }
  })

  it('never matches missing, imputed or limit values', () => {
    expect(call('search_planets', { eq_temp_min: 300 }).planets.map((p) => p.name)).toEqual(['Solo b']) // Testa c's 400 K is imputed
    expect(call('search_planets', { insolation_max: 10 }).planets.map((p) => p.name)).toEqual(['Testa b']) // Solo b is "< 3": not matched
    expect(call('search_planets', { radius_min: 0 }).planets.map((p) => p.name)).not.toContain('Testa c')
  })

  it('excludes controversial planets unless asked', () => {
    expect(call('search_planets', { presets: ['hot_jupiter'] }).status).toBe('no_matches')
    expect(call('search_planets', { presets: ['hot_jupiter'], include_controversial: true }).planets[0].name).toBe('Disputed b')
  })

  it('can require directly measured values', () => {
    const all = call('search_planets', { mass_min: 1 }).planets.map((p) => p.name)
    expect(all).toEqual(expect.arrayContaining(['Testa c', 'Solo b']))
    expect(call('search_planets', { mass_min: 1, require_measured: true }).planets.map((p) => p.name)).toEqual(['Testa b', 'Far b'])
  })

  it('sorts with missing values last and respects the limit', () => {
    const r = call('search_planets', { mass_min: 0, sort_by: 'distance', include_controversial: true })
    expect(r.planets.at(-1).name).toBe('Far b') // no distance
    const top = call('search_planets', { presets: ['earth_size'], limit: 3 }, real)
    expect(top.returned).toBe(3)
    expect(top.planets[0].distancePc.value).toBeLessThanOrEqual(top.planets[1].distancePc.value)
  })

  it('rejects empty, contradictory or unknown filters', () => {
    expect(call('search_planets', {}).status).toBe('invalid_arguments')
    expect(call('search_planets', { radius_min: 3, radius_max: 1 }).errors[0]).toMatch(/greater than/)
    expect(call('search_planets', { presets: ['habitable'] }).status).toBe('invalid_arguments')
  })
})

describe('get_planet', () => {
  it('returns the full record for a found planet', () => {
    const r = call('get_planet', { name: 'testa b' })
    expect(r).toMatchObject({ status: 'ok', name: 'Testa b', links: { profileUrl: '/planet/testa-b' } })
  })

  it('returns candidates for an ambiguous name and suggestions for a failed lookup', () => {
    expect(call('get_planet', { name: 'Testa' })).toMatchObject({ status: 'ambiguous', candidates: [{ name: 'Testa b' }, { name: 'Testa c' }], instruction: expect.stringMatching(/do not pick/) })
    expect(call('get_planet', { name: 'Testo b' })).toMatchObject({ status: 'not_found', suggestions: expect.arrayContaining([expect.objectContaining({ name: 'Testa b' })]) })
  })
})

describe('get_system', () => {
  it('lists planets in orbital order with the star and distance', () => {
    const r = call('get_system', { host: 'Testa' })
    expect(r.planets.map((p) => p.name)).toEqual(['Testa b', 'Testa c'])
    expect(r.star.teff).toMatchObject({ value: 3200, status: 'measured' })
    expect(r.distanceLightYears.status).toBe('calculated')
    expect(r.systemUrl).toBe('/explore/Testa')
  })

  it('accepts a planet name and reports unknown systems', () => {
    expect(call('get_system', { host: 'Solo b' })).toMatchObject({ status: 'ok', host: 'Solo', resolvedFrom: 'planet Solo b' })
    expect(call('get_system', { host: 'Nowhere' }).status).toBe('not_found')
    expect(call('get_system', { host: 'Far' }).distanceLightYears.status).toBe('unavailable')
  })
})

describe('compare_planets', () => {
  it('calculates ratios to Earth and to the first planet, flagging minimum masses', () => {
    const r = call('compare_planets', { names: ['Testa b', 'Testa c'] })
    expect(r.comparison.radiusEarth.values['Testa c'].status).toBe('unavailable')
    expect(r.comparison.radiusEarth.relativeToFirst['Testa c']).toBeNull()
    const mass = r.comparison.massEarth.relativeToFirst['Testa c']
    expect(mass).toMatchObject({ status: 'calculated', value: Number((8.2 / 1.3).toPrecision(4)) })
    expect(mass.note).toMatch(/minimum mass/)
    expect(r.comparison.densityGcc.relativeToEarth['Testa b'].value).toBeCloseTo(5.4 / 5.51, 3)
    expect(r.comparison.radiusEarth.relativeToEarth).toBeUndefined() // already in Earth units
  })

  it('reports each failed lookup and rejects a planet compared with itself', () => {
    const r = call('compare_planets', { names: ['Testa b', 'Testa', 'Nope b'] })
    expect(r.status).toBe('lookup_failed')
    expect(r.failures.map((f) => f.status)).toEqual(['ambiguous', 'not_found'])
    expect(call('compare_planets', { names: ['Testa b', 'testa-b'] }).status).toBe('invalid_arguments')
    expect(call('compare_planets', { names: ['Testa b'] }).status).toBe('invalid_arguments')
  })
})

describe('compute_orbit', () => {
  it('gives periastron/apoastron and a real-date position when timing is reliable', () => {
    const r = call('compute_orbit', { name: 'Testa b' })
    expect(r.periastron.distance.value).toBeCloseTo(0.045, 6)
    expect(r.periastron.speed.unit).toBe('km/s')
    expect(r.position).toMatchObject({ status: 'ok', dateUtc: NOW.toISOString(), distanceFromStar: { status: 'calculated', unit: 'AU' } })
    expect(r.position.distanceFromStar.value).toBeGreaterThanOrEqual(0.045 - 1e-9)
    expect(r.position.distanceFromStar.value).toBeLessThanOrEqual(0.055 + 1e-9)
  })

  it('predicts the next transit after now', () => {
    const r = call('compute_orbit', { name: 'Testa b', at: 'next_transit' })
    expect(r.position.status).toBe('ok')
    const t = Date.parse(r.position.dateUtc)
    expect(t).toBeGreaterThanOrEqual(NOW.getTime())
    expect(t - NOW.getTime()).toBeLessThanOrEqual(10.5 * 86400000)
  })

  it('refuses real-date positions without a timing anchor, and orbits without a period', () => {
    const c = call('compute_orbit', { name: 'Testa c' })
    expect(c.position).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/not tied to real dates/) })
    expect(c.elements.eccentricity.status).toBe('assumed')
    expect(call('compute_orbit', { name: 'Testa c', at: 'next_transit' }).position.status).toBe('unavailable')
    expect(call('compute_orbit', { name: 'Far b' })).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/period/) })
  })

  it('validates the time argument and the name', () => {
    expect(call('compute_orbit', { name: 'Testa b', at: 'tomorrowish' }).status).toBe('invalid_arguments')
    expect(call('compute_orbit', { name: 'Testa b', at: 'periastron' }).position).toBeUndefined()
    expect(call('compute_orbit', { name: 'Testa' }).status).toBe('ambiguous')
  })
})

describe('catalog_facts', () => {
  it('counts the catalogue by discovery method', () => {
    const r = call('catalog_facts', {}, real)
    expect(r.planetCount.value).toBe(real.planets.length)
    expect(Object.values(r.byDiscoveryMethod).reduce((a, b) => a + b, 0)).toBe(real.planets.length)
  })

  it('describes existing values only, with extremes linked to planets', () => {
    const r = call('catalog_facts', { field: 'eq_temp' })
    expect(r.valuesByStatus).toEqual({ unavailable: 2, measured: 3 }) // Testa c's imputed value is unavailable
    expect(r.statistics).toMatchObject({ count: 3, min: { planet: 'Testa b', value: 250 }, max: { planet: 'Disputed b', value: 1500 }, median: 900, unit: 'K' })
    expect(r.statistics.note).toMatch(/never used as a value for a planet/)
    expect(call('catalog_facts', { field: 'insolation' }).statistics.count).toBe(1) // the limit is excluded
    expect(call('catalog_facts', { field: 'colour' }).status).toBe('invalid_arguments')
  })
})

describe('explain_concept', () => {
  it('finds concepts by alias and lists options for unknown ones', () => {
    expect(call('explain_concept', { concept: 'M sin i' })).toMatchObject({ status: 'ok', concept: 'minimum_mass', basis: 'established' })
    expect(call('explain_concept', { concept: 'Goldilocks zone' }).references[0].label).toMatch(/Kopparapu/)
    expect(call('explain_concept', { concept: 'warp drive' })).toMatchObject({ status: 'not_found', available: expect.arrayContaining(['Transit method']) })
  })
})

describe('tool registry', () => {
  it('exposes one OpenAI-style definition per tool', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name)).toEqual(TOOL_NAMES)
    for (const t of TOOL_DEFINITIONS) expect(t).toMatchObject({ type: 'function', function: { parameters: { type: 'object' } } })
  })

  it('turns bad calls into recoverable results instead of throwing', () => {
    expect(runTool(fx, 'drop_tables', {}).result.status).toBe('error')
    expect(runTool(fx, 'get_planet', '{not json').result).toEqual({ status: 'invalid_arguments', errors: ['Arguments are not valid JSON'] })
    expect(runTool(fx, 'get_planet', '{}').result.errors).toEqual(['arguments.name is required'])
    expect(runTool(fx, 'search_planets', { radius_min: 'big' }).result.errors).toEqual(['arguments.radius_min must be a number'])
    expect(runTool(fx, 'search_planets', { limit: 500, presets: ['earth_size'] }).result.errors[0]).toMatch(/≤ 12/)
    expect(runTool(fx, 'get_planet', JSON.stringify({ name: 'Testa b' })).result.status).toBe('ok')
  })

  it('keeps every result within the size cap', () => {
    for (const [name, args] of [
      ['search_planets', { presets: ['giant'], limit: 12 }],
      ['get_system', { host: 'KOI-351' }],
      ['compare_planets', { names: ['TRAPPIST-1 b', 'TRAPPIST-1 e', 'Kepler-452 b', '55 Cnc e'] }],
      ['get_planet', { name: 'HD 189733 b' }],
    ]) {
      const r = call(name, args, real)
      expect(r.status, name).toBe('ok')
      expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
    }
  })
})

describe('isolation from the imputation layer', () => {
  it('no AI module imports the imputation pipeline or reads the analysis layer', () => {
    const root = path.join(here, '..')
    const files = []
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) files.push(p)
      }
    }
    walk(root)
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/imputation(\.js)?['"]/)
      expect(src, f).not.toMatch(/\.analysis\b/)
      expect(src, f).not.toMatch(/imputeCatalog|\/api\/analysis/)
    }
  })
})
