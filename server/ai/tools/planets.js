// Planet, system, comparison and orbit tools for the AI — owner: AI
// (implemented by LEAD in M5 Phase 1).
//
// Lookups never guess: an ambiguous or unknown name returns candidates or
// suggestions for the model to offer the user. Ratios and orbit positions are
// computed here (status 'calculated', with their basis) so the model never
// has to do arithmetic on scientific values.

import { dateFromJd, jdFromDate, orbitalElements, orbitExtremes, orbitState, realDateReliability, timingUncertainty, transitPhase } from '../../../src/science/kepler.js'
import { resolveHost, resolvePlanet } from './catalog.js'
import { formatPlanet, formatPlanetSummary, formatQuantity, getField, LABELS, planetLinks, UNITS } from './format.js'

const lookupFailure = (query, r) =>
  r.status === 'ambiguous'
    ? { status: 'ambiguous', query, reason: r.reason, candidates: r.candidates, instruction: 'Ask the user which planet they mean; do not pick one.' }
    : { status: 'not_found', query, suggestions: r.suggestions, instruction: r.suggestions.length ? 'Offer these suggestions; do not assume one.' : 'No confirmed planet with this name is in the NASA catalogue.' }

/** get_planet */
export function getPlanet(ctx, { name }) {
  const r = resolvePlanet(ctx, name)
  if (r.status !== 'found') return lookupFailure(name, r)
  return { status: 'ok', ...(r.resolvedFrom ? { resolvedFrom: r.resolvedFrom } : {}), ...formatPlanet(r.planet) }
}

const orbitOrder = (p) => getField(p, 'semiMajorAxisAU')?.value ?? getField(p, 'periodDays')?.value ?? Infinity

/** get_system */
export function getSystem(ctx, { host }) {
  const r = resolveHost(ctx, host)
  if (r.status !== 'found') {
    return { status: 'not_found', query: host, suggestions: r.suggestions, instruction: 'Offer these suggestions; do not assume one.' }
  }
  const planets = [...ctx.byHost.get(r.host)].sort((a, b) => orbitOrder(a) - orbitOrder(b) || a.name.localeCompare(b.name))
  const first = formatPlanet(planets[0])
  const listed = planets[0].system?.planetCount ?? null
  return {
    status: 'ok',
    host: r.host,
    ...(r.resolvedFrom ? { resolvedFrom: r.resolvedFrom } : {}),
    systemUrl: planetLinks(planets[0]).systemUrl,
    star: first.star,
    distancePc: first.system.distancePc,
    distanceLightYears: first.derived.distanceLightYears ?? { status: 'unavailable', display: 'Unavailable' },
    starCount: planets[0].system?.starCount ?? null,
    planetsInCatalogue: planets.length,
    ...(listed != null && listed !== planets.length ? { note: `The archive lists ${listed} planets for this system; ${planets.length} are in this catalogue snapshot.` } : {}),
    planets: planets.map((p) => formatPlanetSummary(p, ['radiusEarth', 'massEarth', 'periodDays', 'semiMajorAxisAU', 'eccentricity', 'eqTempK'])),
    order: 'Planets are ordered by semi-major axis (or period when the axis is unavailable).',
  }
}

// Radius, mass and insolation are already in Earth units, so need no ratio.
const EARTH = { densityGcc: 5.51, periodDays: 365.25, semiMajorAxisAU: 1 }
const EARTH_NOTE = { densityGcc: 'Earth mean density 5.51 g/cm³', periodDays: 'Earth year 365.25 days', semiMajorAxisAU: 'Earth orbit 1 AU' }
const COMPARE_FIELDS = ['radiusEarth', 'massEarth', 'densityGcc', 'eqTempK', 'insolationEarth', 'periodDays', 'semiMajorAxisAU', 'eccentricity', 'distancePc', 'star.teff']

const ratio = (a, b) => {
  if (a?.value == null || b?.value == null || !(b.value > 0)) return null
  const out = { value: Number((a.value / b.value).toPrecision(4)), unit: '×', status: 'calculated' }
  const notes = []
  if ([a.status, b.status].includes('minimum')) notes.push('uses a minimum mass (M sin i)')
  if ([a.status, b.status].includes('estimated')) notes.push('uses an estimated value')
  if (a.limit || b.limit) notes.push('uses a limit value')
  if (notes.length) out.note = notes.join('; ')
  return out
}

/** compare_planets */
export function comparePlanets(ctx, { names }) {
  const resolved = names.map((n) => [n, resolvePlanet(ctx, n)])
  const failed = resolved.filter(([, r]) => r.status !== 'found')
  if (failed.length) return { status: 'lookup_failed', failures: failed.map(([n, r]) => lookupFailure(n, r)) }
  const planets = [...new Map(resolved.map(([, r]) => [r.planet.id, r.planet])).values()]
  if (planets.length < 2) return { status: 'invalid_arguments', errors: ['Name at least two different planets.'] }

  const rows = {}
  for (const f of COMPARE_FIELDS) {
    const values = Object.fromEntries(planets.map((p) => [p.name, formatQuantity(getField(p, f), f, { compact: true })]))
    const row = { label: LABELS[f], unit: UNITS[f], values }
    if (f in EARTH) {
      row.relativeToEarth = Object.fromEntries(
        planets.map((p) => [p.name, ratio(values[p.name], { value: EARTH[f] })]),
      )
    }
    const [base, ...others] = planets
    if (EARTH_NOTE[f]) row.earthReference = EARTH_NOTE[f]
    row.relativeToFirst = Object.fromEntries(others.map((p) => [p.name, ratio(values[p.name], values[base.name])]))
    rows[f] = row
  }
  return {
    status: 'ok',
    planets: planets.map((p) => ({ id: p.id, name: p.name, host: p.host, profileUrl: planetLinks(p).profileUrl, discoveryMethod: p.discovery?.method ?? null, discoveryYear: p.discovery?.year ?? null })),
    comparison: rows,
    note: `relativeToEarth = value ÷ Earth's; relativeToFirst = value ÷ ${planets[0].name}'s. Ratios are calculated by CELESTRIA from catalogue values (uncertainty not propagated); null means a value is unavailable.`,
  }
}

const DEG = 180 / Math.PI
const num = (v, unit, basis, extra) => (v == null || !Number.isFinite(v) ? null : { value: Number(v.toPrecision(5)), unit, status: 'calculated', display: `${Number(v.toPrecision(4))} ${unit}`, basis, ...extra })

/** compute_orbit */
export function computeOrbit(ctx, { name, at = 'now' }) {
  const r = resolvePlanet(ctx, name)
  if (r.status !== 'found') return lookupFailure(name, r)
  const p = r.planet
  const el = orbitalElements(p)
  const links = planetLinks(p)
  if (!el) return { status: 'unavailable', planet: p.name, reason: 'Orbital period is not in the NASA catalogue, so the orbit cannot be computed.', orbitUrl: links.orbitUrl }

  const basis = "Kepler's equation using the catalogue period, semi-major axis, eccentricity and timing epoch"
  const ext = orbitExtremes(el)
  const physical = el.gm != null && el.aSource !== 'normalised'
  const out = {
    status: 'ok',
    planet: p.name,
    id: p.id,
    orbitUrl: links.orbitUrl,
    profileUrl: links.profileUrl,
    elements: {
      periodDays: formatQuantity(p.periodDays, 'periodDays'),
      semiMajorAxisAU: el.aSource === 'catalog'
        ? formatQuantity(p.semiMajorAxisAU, 'semiMajorAxisAU')
        : el.aSource === 'kepler'
          ? num(el.a, 'AU', "Kepler's third law from period and star mass")
          : { status: 'unavailable', display: 'Unavailable (orbit shown on a relative scale)' },
      eccentricity: el.eStatus === 'measured' ? formatQuantity(p.eccentricity, 'eccentricity') : { value: 0, status: 'assumed', display: '0 (assumed circular)', note: el.eStatus === 'assumed' ? 'Fixed at 0 in the source fit' : 'Not in the catalogue; circular orbit assumed' },
    },
    assumptions: el.assumptions.map((a) => a.text),
  }
  if (el.aSource !== 'normalised') {
    out.periastron = { distance: num(ext.periastronAU, 'AU', 'a(1 − e)'), speed: physical ? num(ext.speedPeriKmS, 'km/s', 'vis-viva equation') : null }
    out.apoastron = { distance: num(ext.apoastronAU, 'AU', 'a(1 + e)'), speed: physical ? num(ext.speedApoKmS, 'km/s', 'vis-viva equation') : null }
  }

  if (at === 'periastron' || at === 'apoastron') return out

  const nowJd = jdFromDate(ctx.now ? ctx.now() : new Date())
  let t = nowJd
  if (at === 'next_transit') {
    if (!el.transits || el.anchor.kind !== 'transit') {
      return { ...out, position: { status: 'unavailable', reason: 'No transit midpoint in the catalogue, so transit times cannot be predicted.' } }
    }
    const n = Math.ceil((nowJd - el.anchor.epoch) / el.P)
    t = el.anchor.epoch + n * el.P
  } else if (at !== 'now') {
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return { status: 'invalid_arguments', errors: [`"at" must be now, periastron, apoastron, next_transit or an ISO date; got "${at}"`] }
    t = jdFromDate(d)
  }
  const rel = realDateReliability(el, t)
  if (!rel.ok) {
    out.position = { status: 'unavailable', at, reason: `A real-date position cannot be given reliably: ${rel.reason}.` }
    return out
  }
  const s = orbitState(el, t)
  const u = timingUncertainty(el, t)
  const extra = { timingUncertaintyDays: Number(u.sigmaDays.toPrecision(2)) }
  out.position = {
    status: 'ok',
    at,
    dateUtc: dateFromJd(t).toISOString(),
    distanceFromStar: num(s.rAU, 'AU', basis, extra),
    orbitalSpeed: physical ? num(s.speedKmS, 'km/s', `${basis}; vis-viva equation`, extra) : null,
    phaseFromPeriastron: num(s.phase, 'fraction of orbit', basis, extra),
    trueAnomaly: num(s.trueAnomaly * DEG, '°', basis, extra),
    ...(transitPhase(el) != null ? { transitPhase: num(transitPhase(el), 'fraction of orbit', basis) } : {}),
    note: `Position predicted from the catalogue epoch ${u.orbitsFromEpoch.toFixed(0)} orbits away; timing uncertainty ±${u.sigmaDays.toPrecision(2)} days${u.complete ? '' : ' (lower bound: epoch uncertainty not reported)'}.`,
  }
  return out
}
