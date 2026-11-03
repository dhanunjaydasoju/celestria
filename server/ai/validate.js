// Scientific answer validator — owner: AI (implemented by LEAD in M5 Phase 1).
//
// The model answers in structured claims; every claim carries a `basis`.
// This module checks each claim against the tool results of the same request
// (the only evidence), so a wrong answer is rejected before the user sees it:
//
//   • numbers   — every number must appear in the evidence (to its stated
//                 precision), with a compatible unit and provenance label
//   • ±         — uncertainties must match the data; asymmetric errors may
//                 not be averaged into a single ±
//   • wording   — minimum masses, limits, estimates and assumptions must be
//                 described as such
//   • science   — no composition, habitable-zone placement or life claims
//                 presented as fact; speculation must be hedged
//   • sources   — citations, links and planet ids must come from the evidence
//   • entities  — a value must belong to the object the claim gives it to
//                 (the Sun is not a host star; a planet's radius is not its
//                 star's), using the owners tagged on the evidence (entities.js)
//   • SUNFALL   — a volume equivalence is never described as packing planets
//                 into the Sun, and no volume count is given unless a tool
//                 provided it (packing.js)
//
// It never fixes an answer: it reports errors so the caller can retry or
// fall back. Fully deterministic; no model involved.

import { ATTRIBUTED_UNITS, compatible, describeEntity, mentions, subjectAt } from './entities.js'
import { isVolumeEquivalence, packingClaims, packingMisnomers, splitSentences, volumeCounts } from './packing.js'
import { CONSTELLATIONS } from './tools/catalog.js'
import { planetLinks } from './tools/format.js'

export const BASES = ['measured', 'calculated', 'estimated', 'minimum', 'assumed', 'catalog', 'classification', 'unavailable', 'established', 'hypothesis']
const DATA_BASES = new Set(['measured', 'calculated', 'estimated', 'minimum', 'assumed'])
const PROVENANCE = new Set(['measured', 'calculated', 'estimated', 'minimum', 'assumed', 'catalog', 'catalog statistic', 'classification', 'established'])
/** Context numbers (thresholds, constants, the user's own numbers) fit any basis. */
const CONTEXT = new Set(['reference', 'constant', 'user'])
const COMPATIBLE = {
  // 'catalog' = plain catalogue facts (discovery year, counts), fine beside data.
  measured: ['measured', 'catalog'],
  calculated: ['calculated', 'catalog'],
  estimated: ['estimated', 'catalog'],
  minimum: ['minimum', 'catalog'],
  assumed: ['assumed', 'catalog'],
  catalog: ['catalog', 'catalog statistic'],
  classification: ['classification', 'catalog'],
  established: ['established'],
  hypothesis: [...PROVENANCE],
  unavailable: [],
}

export const LIMITS = { sections: 8, claimsPerSection: 12, claimChars: 700 }

// ── Units ──────────────────────────────────────────────────────────────────
const UNIT_ALIASES = [
  ['R⊕', ['R⊕', 'R_⊕', 'R_E', 'Rₑ', 'Earth radii', 'Earth radius', 'Earth-radii', 'Earth-radius']],
  ['M⊕', ['M⊕', 'M_⊕', 'M_E', 'Mₑ', 'Earth masses', 'Earth mass', 'Earth-masses', 'Earth-mass']],
  ['R_J', ['R_J', 'RJ', 'R♃', 'Jupiter radii', 'Jupiter radius', 'Jovian radii']],
  ['M_J', ['M_J', 'MJ', 'M♃', 'Jupiter masses', 'Jupiter mass', 'Jovian masses']],
  ['R☉', ['R☉', 'R⊙', 'R_sun', 'R_☉', 'solar radii', 'solar radius', 'Sun radii']],
  ['M☉', ['M☉', 'M⊙', 'M_sun', 'M_☉', 'solar masses', 'solar mass', 'Sun masses']],
  ['S⊕', ['S⊕', 'S_⊕', 'S_E', "times Earth's insolation", 'Earth insolation', 'Earth flux']],
  ['celsius', ['°C', 'degrees Celsius', 'Celsius', '°F', 'degrees Fahrenheit', 'Fahrenheit']],
  ['K', ['K', 'kelvin', 'Kelvin']],
  ['days', ['days', 'day', 'd']],
  ['hours', ['hours', 'hour', 'hrs', 'hr', 'h']],
  ['Gyr', ['Gyr', 'billion years', 'Ga']],
  ['years', ['Earth years', 'years', 'year', 'yrs', 'yr']],
  ['light-years', ['light-years', 'light years', 'light-year', 'light year', 'ly']],
  ['AU', ['AU', 'au', 'astronomical units', 'astronomical unit']],
  ['pc', ['pc', 'parsecs', 'parsec']],
  ['km', ['km', 'kilometres', 'kilometers', 'miles', 'mi']],
  ['g/cm³', ['g/cm³', 'g/cm3', 'g cm⁻³', 'g cm^-3', 'g/cc', 'grams per cubic centimetre', 'grams per cubic centimeter']],
  ['m/s²', ['m/s²', 'm/s2', 'm s⁻²', 'm s^-2']],
  ['km/s', ['km/s', 'kilometres per second', 'kilometers per second']],
  // Units no tool returns: any value in them was converted or invented.
  ['pressure', ['bar', 'bars', 'atm', 'atmospheres', 'Pa', 'kPa', 'MPa', 'psi', 'mbar']],
  ['power', ['W/m²', 'W/m2', 'watts', 'W']],
  ['speed', ['km/h', 'mph', 'm/s']],
  ['mass', ['kg', 'tonnes', 'tons']],
  ['%', ['%', 'percent', 'per cent']],
  ['×', ['g', "Earth's gravity", 'Earth gravity']],
  ['×', ['×', 'times', 'x']],
  ['°', ['°', 'degrees', 'deg']],
  ['dex', ['dex']],
]
const UNIT_PATTERNS = UNIT_ALIASES.flatMap(([canon, aliases]) => aliases.map((a) => [a, canon])).sort((a, b) => b[0].length - a[0].length)
const UNIT_OF = new Map(UNIT_PATTERNS)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// After a number: optional space, then a unit not followed by a letter/digit.
const UNIT_RE = new RegExp(`^\\s?(${UNIT_PATTERNS.map(([a]) => esc(a)).join('|')})(?![\\p{L}\\p{N}])`, 'u')

/** Evidence unit → canonical unit. */
const canonUnit = (u) => {
  if (u == null || u === '') return null
  if (u === '× Earth') return '×'
  if (u === 'fraction of orbit' || u === 'BJD' || u === 'log10(L/L☉)') return u
  return UNIT_OF.get(u) ?? u
}
/** Values that are already "times Earth" can be quoted as "N times". */
const RELATIVE_UNITS = new Set(['×', 'R⊕', 'M⊕', 'S⊕'])

function unitCompatible(claimUnit, evUnit) {
  if (claimUnit == null) return true
  if (claimUnit === evUnit) return true
  if (claimUnit === '×' && RELATIVE_UNITS.has(evUnit)) return true
  return false
}

// ── Numbers ────────────────────────────────────────────────────────────────
const MINUS = /[−–]/g
const NUM_RE = /(?<![\p{L}\p{N}.,_/])(?:[-−](?=\d))?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\p{N}])/gu
const UNC_RE = /^\s*(?:±\s*(\d[\d,]*(?:\.\d+)?)|\+\s*(\d[\d,]*(?:\.\d+)?)\s*\/?\s*[-−–]\s*(\d[\d,]*(?:\.\d+)?))/

const toNumber = (s) => Number(String(s).replace(MINUS, '-').replace(/,/g, ''))

/** Rounding tolerance implied by how a number is written. */
function precision(str) {
  const s = String(str).replace(MINUS, '').replace(/,/g, '')
  const [int, frac] = s.split('.')
  if (frac != null) {
    const digits = (int.replace(/^0+/, '') + frac).replace(/^0+/, '')
    return { tol: 0.5 * 10 ** -frac.length, sig: digits.length }
  }
  const trailing = /0*$/.exec(int)[0].length
  const sigDigits = int.replace(/^0+/, '').replace(/0+$/, '').length || 1
  return { tol: trailing && int.length > 1 ? 0.5 * 10 ** trailing : 0.5, sig: sigDigits }
}

function sameNumber(claimStr, ev, scale = 1) {
  const cv = toNumber(claimStr) / scale
  const { tol, sig } = precision(claimStr)
  const t = tol / scale
  if (Math.abs(ev - cv) > t * (1 + 1e-9) + 1e-12) return false
  // Too coarse to be a faithful quote ("about 1" for 1.4) unless within 5%.
  return sig >= 2 || ev === cv || Math.abs(ev - cv) <= Math.abs(ev) * 0.05
}

/**
 * Numbers in text with any uncertainty and unit that follow them.
 * @returns {{ str: string, value: number, unit: string|null, unc: null|{sym?: string, plus?: string, minus?: string}, index: number }[]}
 */
export function extractNumbers(text) {
  const out = []
  const consumed = []
  for (const m of text.matchAll(NUM_RE)) {
    if (consumed.some(([a, b]) => m.index >= a && m.index < b)) continue
    let end = m.index + m[0].length
    let rest = text.slice(end)
    let unc = null
    const u = UNC_RE.exec(rest)
    if (u) {
      unc = u[1] ? { sym: u[1] } : { plus: u[2], minus: u[3] }
      end += u[0].length
      rest = text.slice(end)
      consumed.push([m.index, end])
    }
    const um = UNIT_RE.exec(rest)
    let unit = um ? UNIT_OF.get(um[1]) : null
    // A bare "x"/"d"/"h" is only a unit when it directly follows the number.
    if (um && ['x', 'd', 'h'].includes(um[1]) && rest[0] === ' ') unit = null
    out.push({ str: m[0], value: toNumber(m[0]), unit, unc, index: m.index })
  }
  return out
}

// ── Evidence ───────────────────────────────────────────────────────────────
// Reference constants an answer may quote. Earth's own "1 R⊕" etc. are left
// out on purpose: they would let any value near 1 pass as a constant.
const CONSTANTS = [[365.25, 'days', 'earth'], [5.51, 'g/cm³', 'earth'], [317.83, 'M⊕', 'jupiter'], [11.209, 'R⊕', 'jupiter'], [3.26156, 'light-years'], [9.81, 'm/s²', 'earth'], [9.80665, 'm/s²', 'earth']]

/**
 * Index every number, label, source, link and planet in the tool results.
 * @param {{ name: string, args?: object, result: object }[]} toolResults
 */
export function buildEvidence(toolResults, { question = '' } = {}) {
  const ev = { numbers: [], strings: new Set(), names: new Set(), planets: new Map(), sources: new Map(), urls: new Set(), types: new Map(), hz: new Map(), hzHosts: new Map(), stars: new Set(), hosts: new Map() }
  const addNumber = (value, unit, status, extra = {}) => {
    if (typeof value === 'number' && Number.isFinite(value)) ev.numbers.push({ value, unit: canonUnit(unit), status, ...extra })
  }
  const addSource = (label, url) => {
    if (!label) return
    const prev = ev.sources.get(label)
    ev.sources.set(label, { label, url: url ?? prev?.url ?? null })
  }
  const addText = (s, status, key) => {
    if (/^(https?:\/\/|\/)/.test(s)) return void ev.urls.add(s)
    ev.strings.add(s)
    // display/basis strings restate values that are indexed with their own status.
    if (key === 'display' || key === 'basis') return
    // Numbers in texts are context (thresholds, notes), not the record's own
    // measurements; reference texts that name Earth belong to Earth.
    const own = /\bEarth\b/.test(s) ? { kind: 'earth', name: 'Earth' } : null
    for (const n of extractNumbers(stripNames(s, ev.names))) addNumber(n.value, n.unit, status === 'established' ? 'established' : 'reference', { entity: own })
  }

  // Each number keeps the entity it belongs to (planet, star/system, Earth),
  // so a claim cannot attribute it to another object (checkAttribution).
  const walk = (node, status, unit, key, entity = null, field = null) => {
    if (node == null) return
    if (typeof node === 'number') return void addNumber(node, unit, status ?? 'catalog', { entity })
    if (typeof node === 'string') return void (key === 'source' ? addSource(node) : addText(node, status, key))
    if (Array.isArray(node)) return void node.forEach((n) => walk(n, status, unit, key, entity, field))
    if (typeof node !== 'object') return
    entity = entityOf(node, key, entity)

    if (typeof node.name === 'string' && typeof node.id === 'string' && !ev.planets.has(node.id)) {
      const links = planetLinks({ id: node.id, name: node.name, host: node.host ?? '' })
      ev.planets.set(node.id, { id: node.id, name: node.name, profileUrl: links.profileUrl, nasaOverviewUrl: links.nasaOverviewUrl })
    }
    for (const k of ['name', 'host', 'planet']) if (typeof node[k] === 'string') ev.names.add(node[k])
    if (typeof node.label === 'string' && typeof node.url === 'string') addSource(node.label, node.url)
    // CELESTRIA's size/temperature class per planet ("Rocky world · Temperate").
    // Habitable-zone results of assess_habitability, per planet.
    if (typeof node.planet === 'string' && node.habitableZone && typeof node.habitableZone === 'object') {
      ev.hz.set(node.planet, node.habitableZone)
      // The zone belongs to the star, so claims about "the habitable zone of <host>" use it too.
      if (typeof node.host === 'string' && !ev.hzHosts.has(node.host)) ev.hzHosts.set(node.host, node.habitableZone)
    }
    const typeLabel = typeof node.type === 'string' ? node.type : node.type?.label
    if (typeof node.name === 'string' && typeof typeLabel === 'string') ev.types.set(node.name, typeLabel)

    const own = typeof node.status === 'string' && PROVENANCE.has(node.status) ? node.status : node.basis === 'established' ? 'established' : status
    const ownUnit = typeof node.unit === 'string' ? node.unit : unit
    if (typeof node.value === 'number' && own) {
      addNumber(node.value, ownUnit, own, { uncertainty: node.uncertainty ?? null, limit: node.limit ?? null, source: typeof node.source === 'string' ? node.source : node.source?.label, entity })
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'value' || k === 'uncertainty' || k === 'status' || k === 'unit') continue
      // Keys of comparison maps are planet names; a 'star.*' row belongs to that planet's host.
      if (k === 'values' || k === 'relativeToEarth' || k === 'relativeToFirst') {
        for (const [name, item] of Object.entries(v ?? {})) {
          ev.names.add(name)
          const owner = String(key ?? '').startsWith('star.') ? { kind: 'star', name: ev.hosts.get(name) ?? null } : { kind: 'planet', name }
          walk(item, own, ownUnit, k, owner, key)
        }
        continue
      }
      walk(v, own, ownUnit, k, entity, field)
    }
  }

  // Whose values a node holds: a planet record, a star, a system.
  const entityOf = (node, key, parent) => {
    const host = typeof node.host === 'string' ? node.host : null
    if (key === 'star' || /^star[A-Z]/.test(key ?? '')) return { kind: 'star', name: (typeof node.name === 'string' && key === 'star' ? node.name : null) ?? parentHost(parent) }
    if (key === 'system') return { kind: 'star', name: parentHost(parent) }
    // A habitable zone belongs to the star; its planet… fields stay the planet's.
    if (key === 'habitableZone') return { kind: 'star', name: parentHost(parent), planet: parent?.kind === 'planet' ? parent.name : null }
    if (/^planet[A-Z]/.test(key ?? '') && parent?.planet) return { kind: 'planet', name: parent.planet, host: parent.name }
    if (typeof node.id === 'string' && typeof node.name === 'string') return { kind: 'planet', name: node.name, host }
    if (typeof node.planet === 'string' && typeof node.id === 'string') return { kind: 'planet', name: node.planet, host }
    if (host && !parent && Array.isArray(node.planets) && node.star) return { kind: 'star', name: host }
    return parent
  }
  const parentHost = (e) => (e?.kind === 'star' ? e.name : e?.host ?? null)
  // Names first so numbers inside names are not indexed as values.
  const collectNames = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(collectNames)
    for (const k of ['name', 'host', 'planet']) if (typeof node[k] === 'string') ev.names.add(node[k])
    if (typeof node.host === 'string') {
      ev.stars.add(node.host)
      const p = typeof node.name === 'string' && typeof node.id === 'string' ? node.name : typeof node.planet === 'string' ? node.planet : null
      if (p) ev.hosts.set(p, node.host)
    }
    Object.values(node).forEach(collectNames)
  }
  for (const r of toolResults) collectNames(r.result)
  for (const r of toolResults) walk(r.result, null, null, null)
  for (const [value, unit, owner] of CONSTANTS) addNumber(value, unit, 'constant', { entity: owner ? { kind: owner, name: owner } : null })
  for (const n of extractNumbers(stripNames(question, ev.names))) addNumber(n.value, n.unit, 'user')
  return ev
}

// ── Text helpers ───────────────────────────────────────────────────────────
const CONST_WORDS = [...Object.keys(CONSTELLATIONS), ...new Set(Object.values(CONSTELLATIONS))].map(esc).sort((a, b) => b.length - a.length).join('|')
// Catalogue designations: "Kepler-452 b", "HD 189733", "55 Cnc e", "KOI-351.01", "L 98-59".
const DESIGNATION_RE = new RegExp(
  [
    String.raw`\b[A-Za-z][A-Za-z0-9+]*(?:-[A-Za-z]+)*-\d+(?:[.-]\d+)*(?:\s?[A-Z]{1,2}\b)?(?:\s[a-z]\b)?`,
    String.raw`\b(?:HD|HIP|HR|GJ|Gl|Gliese|LHS|LTT|LP|Wolf|Ross|TIC|EPIC|BD|CD|TYC|2MASS|WD|PSR|NGC|Kepler|KOI|K2|TOI|WASP|HATS|XO|TrES|KELT|Qatar|CoRoT|OGLE|MOA|KMT|L|G|GJ|Teegarden's Star|YZ|AU|DS|V\d+|CoRoT)\s[+-]?\d+(?:[.-]\d+)*(?:\s?[A-Z]{1,2}\b)?(?:\s[a-z]\b)?`,
    String.raw`\b\d{1,3}\s(?:${CONST_WORDS})\b(?:\s[A-Z]\b)?(?:\s[a-z]\b)?`,
  ].join('|'),
  'gi',
)
const CITATION_RE = /\b([A-Z][\p{L}'’-]+(?:\s(?:&|and)\s[A-Z][\p{L}'’-]+)?(?:\set\sal\.?)?),?\s\(?((?:19|20)\d{2})[a-z]?\)?/gu
const MD_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g
const URL_RE = /\bhttps?:\/\/[^\s)\]>"']+/g
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?\b/g
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_RE = `(${MONTHS.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\.?`
// "October 31, 2026" or "31 October 2026", optionally ", at 21:06 UTC".
const HUMAN_DATE_RE = new RegExp(`\\b(?:${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})|(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE},?\\s+(\\d{4}))(?:,?\\s*(?:at\\s+)?(\\d{1,2}):(\\d{2})(?:\\s*UTC)?)?`, 'gi')
const MONTH_NAMES = new Set([...MONTHS, 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'])
const monthIndex = (m) => MONTHS.findIndex((full) => full.startsWith(m.toLowerCase().replace('.', '').slice(0, 3)))

/** Names and designations blanked with letters of the same length, so number positions stay valid. */
function maskSameLength(text, ms) {
  let s = String(text)
  for (const m of ms) s = s.slice(0, m.index) + 'x'.repeat(m.end - m.index) + s.slice(m.end)
  return s.replace(DESIGNATION_RE, (d) => 'x'.repeat(d.length))
}

function stripNames(text, names) {
  let s = String(text ?? '')
  for (const n of [...names].sort((a, b) => b.length - a.length)) if (/\d/.test(n)) s = s.replace(new RegExp(esc(n), 'gi'), ' ⟨name⟩ ')
  return s.replace(DESIGNATION_RE, ' ⟨name⟩ ')
}

const normLabel = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const HEDGE = /\b(might|may|could|possibly|perhaps|if\b|would|speculat\w*|hypothe\w*|uncertain|unknown|not (yet )?known|unconfirmed|cannot (be )?(say|determine|confirm)|no (direct )?evidence)/i
// Only epistemic negations excuse a science term ("unknown", "no evidence",
// "does not mean"); a plain "not" is itself a claim ("it is not rocky").
const NEGATION = /\b(unknown|not (yet )?known|unclear|no (direct )?(data|information|measurements?|evidence)|not in the (nasa )?catalog(ue)?|not computed|cannot be (determined|confirmed|known|said|measured)|can't be (determined|confirmed|known)|unavailable|undetermined|unconfirmed|unproven|not (yet )?(confirmed|established|measured)|does not (mean|imply|make|indicate)|doesn't (mean|imply|make|indicate)|not evidence|is not a property|not a property)\b/i
const COMPOSITION = /\b(rocky (planet|world|surface|composition|core)|is rocky|are rocky|iron[- ](core|rich)|metallic core|silicate|(global |surface |deep )?ocean(s)?\b|water[- ]?world|water-rich|hycean|lava (world|ocean|planet)|magma ocean|molten surface|ice giant composition|made (mostly )?of|composed (mostly )?of|its composition|hydrogen(-rich)? (envelope|atmosphere)|thick atmosphere|has an atmosphere|atmosphere (of|contains|rich)|nitrogen|oxygen|carbon dioxide|\bco2\b|methane|water vapou?r|ammonia|\brocky\b|gaseous|gas-rich|solid surface|volatile-rich|envelope)/i
// Any planet-specific mention of the habitable zone ("in", "near the inner
// edge of", "outside"): the tools do not compute zone boundaries.
const HZ_PLACEMENT = /\b(habitable|goldilocks)[- ]zones?\b|\bHZ\b/i
// What a claim says about placement → the placements that make it true.
const ZONE_PHRASES = [
  { kind: 'near', re: /\b(near|close to|at|on|straddl\w*)\s+(the\s+)?(its\s+)?(inner|outer)?\s*(edge|boundary|boundaries)|straddl\w+/ },
  { re: /\b(inside|within|in|lies in|falls in|sits in)\s+(the\s+|its\s+(star'?s?\s+)?)?conservative\s+(habitable|goldilocks)[- ]zone/, set: ['conservative'] },
  { re: /\b(inside|within|in|lies in|falls in|sits in)\s+(the\s+|its\s+(star'?s?\s+)?)?optimistic\s+(habitable|goldilocks)[- ]zone/, set: ['optimistic_inner', 'conservative', 'optimistic_outer'] },
  { re: /\b(outside|beyond)\s+(the\s+|its\s+(star'?s?\s+)?)?conservative\s+(habitable|goldilocks)[- ]zone/, set: ['hot', 'optimistic_inner', 'optimistic_outer', 'cold'] },
  { re: /\b(outside|beyond)\s+(the\s+|its\s+(star'?s?\s+)?)?(optimistic\s+)?(habitable|goldilocks)[- ]zone/, set: ['hot', 'cold'] },
  { re: /\b(more (starlight|flux|stellar flux|irradiation)|closer)\s+than\s+(the\s+)?(optimistic\s+)?(inner edge|inner boundary|habitable[- ]zone)|interior to the (optimistic\s+)?(inner edge|habitable[- ]zone)|too (hot|close)/, set: ['hot'] },
  { re: /\b(less (starlight|flux|stellar flux|irradiation)|farther|further)\s+than\s+(the\s+)?(optimistic\s+)?(outer edge|outer boundary|habitable[- ]zone)|beyond the (optimistic\s+)?outer edge|too (cold|far)/, set: ['cold'] },
  { re: /\b(inside|within|in|lies in|falls in|sits in)\s+(the\s+|its\s+(star'?s?\s+)?)?(habitable|goldilocks)[- ]zone/, set: ['conservative'] }, // unqualified = conservative
]

function claimedPlacements(lower) {
  const out = []
  let text = lower
  for (const p of ZONE_PHRASES) {
    const m = p.re.exec(text)
    if (!m) continue
    out.push(p.kind === 'near' ? { kind: 'near', text: m[0] } : { set: p.set, text: m[0] })
    text = text.replace(m[0], ' ') // a phrase counts once (more specific phrases first)
  }
  return out
}

const HABITABLE_DENIAL = /\b((is|are)\s+not\s+habitable|uninhabitable|(cannot|could not|can't)\s+(support|host|harbou?r)\s+life)\b/i
// Interpretation inside a data claim belongs in a separate hypothesis claim.
const INFERENCE = /\b(suggest(s|ing)?|indicat(es|ing)|impl(y|ies|ying)|which means|meaning (that )?it|making it (likely|probably|possibl[ey])|consistent with|likely|probably|so it (is|has|must))\b/i
const HABITABLE_ASSERT = /\b((is|are|be|being|was)\s+(a\s+)?(potentially\s+|likely\s+|probably\s+|possibly\s+)?habitable|habitable\s+(planet|world|exoplanet)|(has|have|harbou?rs?|supports?|hosts?|sustains?)\s+(alien\s+|extraterrestrial\s+)?life)\b/i
const LIFE = /\b(life|living organisms|biosignatures?|inhabited|aliens?|extraterrestrial)\b/i
const EARTH_LIKE = /\b(earth[- ](like|twin)|second earth|earth 2\.0)\b(?!\s+(size|radius|mass|in size|in radius|in mass))/i

const TYPE_LABELS = /\b(rocky world|sub-neptune|neptune-like|gas giant)\b/gi
// A size class attributed to temperature ("a rocky world based on its size and temperature").
const SIZE_FROM_TEMPERATURE = /\b(rocky world|sub-neptune|neptune-like|gas giant)s?\b[^.;]*?\b(based on|from|by|using|determined by|derived from|according to)\b[^.;]{0,40}\btemperatures?\b/i
const THERMAL_TERMS = /\b(scorching|hot|warm|temperate|cold)\b/i
const CLASS_TERMS = /\b(rocky world|sub-neptune|neptune-like|gas giant|super-earth|mini-neptune|hot jupiter|ice giant|terrestrial|scorching|hot|warm|temperate|cold)s?\b/i
const SIZE_CLASS = /\b(sub-neptunes?|super-earths?|neptune-like|gas giants?|hot jupiters?|mini-neptunes?|rocky worlds?)\b/i

// Rankings ("the second closest") must match a search sorted by that property.
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 }
const SUPERLATIVES = {
  closest: ['distance', 'asc'], nearest: ['distance', 'asc'], farthest: ['distance', 'desc'], furthest: ['distance', 'desc'],
  largest: ['radius', 'desc'], biggest: ['radius', 'desc'], smallest: ['radius', 'asc'],
  hottest: ['eq_temp', 'desc'], coldest: ['eq_temp', 'asc'], coolest: ['eq_temp', 'asc'],
  'most massive': ['mass', 'desc'], heaviest: ['mass', 'desc'], 'least massive': ['mass', 'asc'], lightest: ['mass', 'asc'],
}
const RANK_RE = new RegExp(`\\b(one of the\\s+)?(?:(${Object.keys(ORDINALS).join('|')}|\\d+(?:st|nd|rd|th))[- ]?)?(${Object.keys(SUPERLATIVES).join('|')})\\b`, 'gi')

const sentences = (text) => text.split(/(?<=[.!?;])\s+/)
const negated = (text, re) => sentences(text).filter((s) => re.test(s)).every((s) => NEGATION.test(s.slice(0, s.search(re) + 40)))

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * @param {{ sections: { title?: string, claims: { text: string, basis: string, refs?: string[] }[] }[], planets?: string[] }} answer
 * @param {{ name: string, args?: object, result: object }[]} toolResults
 * @param {{ question?: string, requireReferences?: boolean }} [opts]
 *   requireReferences: 'established' claims need a curated concept (explain_concept) in the evidence
 */
export function validateAnswer(answer, toolResults, { question = '', requireReferences = false } = {}) {
  const errors = []
  const warnings = []
  const fail = (where, rule, message) => errors.push({ ...where, rule, message })
  const warn = (where, rule, message) => warnings.push({ ...where, rule, message })

  if (!answer || !Array.isArray(answer.sections) || !answer.sections.length) {
    return { ok: false, errors: [{ rule: 'schema', message: 'Answer must have a non-empty "sections" array' }], warnings, links: [], sources: [], checkedNumbers: 0 }
  }
  if (answer.sections.length > LIMITS.sections) fail({}, 'schema', `At most ${LIMITS.sections} sections`)

  const ev = buildEvidence(toolResults, { question })
  const labelsNorm = new Map([...ev.sources.values()].map((s) => [normLabel(s.label), s]))
  const evidenceStrings = [...ev.strings, ...ev.names, ...ev.sources.keys()].filter((s) => s.length >= 3 && !/^(ok|unavailable)$/i.test(s)).map((s) => s.toLowerCase())
  const usedSources = new Map()
  const referenced = new Set()
  const concepts = toolResults.filter((r) => r.name === 'explain_concept' && r.result?.status === 'ok')
  const conceptKeys = new Set(concepts.map((c) => c.result.concept))
  const searches = toolResults
    .filter((r) => r.name === 'search_planets' && r.result?.status === 'ok')
    .map((r) => ({ sortBy: r.args?.sort_by ?? 'distance', order: r.args?.order === 'desc' ? 'desc' : 'asc', names: r.result.planets.map((p) => p.name) }))
  for (const c of concepts) for (const ref of c.result.references ?? []) usedSources.set(ref.label, { label: ref.label, url: ref.url ?? null })
  let checked = 0
  const claimTexts = [] // in order, for the cross-claim SUNFALL check

  answer.sections.forEach((section, si) => {
    const claims = section?.claims
    if (!Array.isArray(claims) || !claims.length) return fail({ section: si }, 'schema', 'Each section needs a non-empty "claims" array')
    if (section.title != null) checkTitle(section.title, { section: si, text: String(section.title).slice(0, 80) })
    if (claims.length > LIMITS.claimsPerSection) fail({ section: si }, 'schema', `At most ${LIMITS.claimsPerSection} claims per section`)
    claims.forEach((claim, ci) => {
      const where = { section: si, claim: ci, text: typeof claim?.text === 'string' ? claim.text.slice(0, 160) : undefined }
      if (!claim || typeof claim.text !== 'string' || !claim.text.trim()) return fail(where, 'schema', 'Claim text is required')
      if (claim.text.length > LIMITS.claimChars) fail(where, 'schema', `Claim longer than ${LIMITS.claimChars} characters`)
      const bases = Array.isArray(claim.basis) ? claim.basis : [claim.basis]
      if (bases.includes('imputed')) return fail(where, 'imputed', 'Imputed values are never allowed in answers')
      const badBasis = bases.filter((b) => !BASES.includes(b))
      if (!bases.length || badBasis.length) return fail(where, 'schema', `Unknown basis "${badBasis.join(', ') || '(none)'}"; use one of: ${BASES.join(', ')}`)
      for (const id of claim.refs ?? []) {
        if (conceptKeys.has(id)) continue // a concept key used as a reference is harmless
        if (!ev.planets.has(id)) fail(where, 'planet-ref', `Planet id "${id}" is not in the tool results`)
        else referenced.add(id)
      }
      checkClaim(claim.text, bases, where)
      checkVolumeCount(claim.text, where)
      claimTexts.push({ text: claim.text, where })
    })
  })
  checkPacking()
  checkAttribution()
  for (const id of answer.planets ?? []) {
    if (!ev.planets.has(id)) fail({}, 'planet-ref', `Planet id "${id}" is not in the tool results`)
    else referenced.add(id)
  }

  function checkClaim(raw, bases, where) {
    const basisSet = new Set(bases)
    const has = (b) => basisSet.has(b)
    let text = raw

    // Links: only URLs the tools returned.
    for (const m of [...text.matchAll(MD_LINK_RE)]) if (!ev.urls.has(m[2])) fail(where, 'link', `Link "${m[2]}" is not from the tool results`)
    text = text.replace(MD_LINK_RE, '$1')
    for (const m of text.match(URL_RE) ?? []) if (!ev.urls.has(m)) fail(where, 'link', `URL "${m}" is not from the tool results`)
    text = text.replace(URL_RE, ' ')

    // Citations must name a source in the evidence.
    for (const m of [...text.matchAll(CITATION_RE)]) {
      if (MONTH_NAMES.has(m[1].toLowerCase().replace('.', ''))) continue // "November 2026" is a date
      const label = normLabel(`${m[1]} ${m[2]}`)
      const hit = [...labelsNorm.entries()].find(([k]) => k === label || k.startsWith(label) || label.startsWith(k))
      if (hit) usedSources.set(hit[1].label, hit[1])
      else fail(where, 'citation', `Citation "${m[0].trim()}" does not match any source in the tool results`)
    }
    text = text.replace(CITATION_RE, (c, author) => (MONTH_NAMES.has(author.toLowerCase().replace('.', '')) ? c : ' ⟨cite⟩ '))
    for (const s of ev.sources.values()) if (raw.includes(s.label)) usedSources.set(s.label, s)

    // Dates are only allowed if the tools produced them (or the user gave them).
    for (const d of text.match(ISO_DATE_RE) ?? []) {
      const ok = [...ev.strings].some((s) => s.startsWith(d)) || question.includes(d.slice(0, 10))
      if (!ok) fail(where, 'date', `Date ${d} is not in the tool results`)
    }
    text = text.replace(ISO_DATE_RE, ' ⟨date⟩ ')
    // Written-out dates and times must match a date the tools produced, to the minute.
    const isoDates = [...ev.strings].filter((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))
    for (const m of [...text.matchAll(HUMAN_DATE_RE)]) {
      const month = monthIndex(m[1] ?? m[5]) + 1
      const day = Number(m[2] ?? m[4])
      const year = Number(m[3] ?? m[6])
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const ok = isoDates.some((iso) => {
        if (m[7] == null) return iso.startsWith(ymd)
        // Allow rounding to the nearest minute.
        const t = Date.parse(iso)
        const claimed = Date.parse(`${ymd}T${String(m[7]).padStart(2, '0')}:${m[8]}:00Z`)
        return Math.abs(t - claimed) <= 60_000
      }) || question.includes(m[0])
      if (!ok) fail(where, 'date', `Date "${m[0].trim()}" does not match a date produced by the orbit tools`)
    }
    text = text.replace(HUMAN_DATE_RE, ' ⟨date⟩ ')

    const body = stripNames(text, ev.names).replace(/^\s*\d+[.)]\s/, ' ').replace(/\b\d+(st|nd|rd|th)\b/g, ' ')
    const nums = extractNumbers(body)
    const dataNumbers = []

    for (const n of nums) {
      checked++
      const scale = n.unit === '%' ? 100 : 1
      const unitWanted = n.unit === '%' ? '×' : n.unit
      // A percentage matches a ratio (×100) or, exactly, a percentage the
      // references state ("about 99.8%" of a curated concept).
      const percents = n.unit === '%' ? ev.numbers.filter((e) => e.unit === '%' && sameNumber(n.str, e.value)) : []
      const valueHits = [...ev.numbers.filter((e) => sameNumber(n.str, e.value, scale)), ...percents]
      const hits = valueHits.filter((e) => unitCompatible(unitWanted, e.unit) || percents.includes(e))
      if (!hits.length) {
        const otherUnits = [...new Set(valueHits.map((e) => e.unit).filter(Boolean))]
        if (otherUnits.length && n.unit) {
          fail(where, 'unit', `${n.str} ${n.unit}: the data has this number in ${otherUnits.join(', ')}, not ${n.unit}`)
        } else if (n.unit && !ev.numbers.some((e) => e.unit === unitWanted)) {
          fail(where, 'unit', `${n.str} ${n.unit}: no tool returned values in ${n.unit}; do not convert units yourself`)
        } else if (!n.unit && Number.isInteger(n.value) && Math.abs(n.value) <= 12 && !n.str.includes('.') && !bases.some((b) => DATA_BASES.has(b))) {
          // Small counts in narrative claims ("two planets") are only warned; data claims must match.
          warn(where, 'small-number', `${n.str} could not be checked against the data`)
        } else {
          fail(where, 'number', `${n.str}${n.unit ? ` ${n.unit}` : ''} is not in the tool results (numbers must be copied from tools, not calculated or recalled)`)
        }
        continue
      }
      const context = hits.filter((e) => CONTEXT.has(e.status))
      const data = hits.filter((e) => !CONTEXT.has(e.status))
      const allowed = new Set(bases.flatMap((b) => COMPATIBLE[b]))
      const compatible = data.filter((e) => allowed.has(e.status))
      if (!compatible.length && !context.length) {
        const statuses = [...new Set(data.map((e) => e.status))]
        if (has('unavailable')) fail(where, 'unavailable', `Claim marked unavailable but quotes ${n.str}, which is in the data as ${statuses.join('/')}`)
        else fail(where, 'provenance', `${n.str} is ${statuses.join(' or ')} in the data, but the claim is labelled ${bases.join('/')}${statuses.length ? `; split the claim or label it ${statuses[0]}` : ''}`)
        continue
      }
      const match = compatible[0] ?? context[0]
      if (compatible.length) dataNumbers.push(match)
      if (match.source) {
        const s = ev.sources.get(match.source)
        if (s) usedSources.set(s.label, s)
      }
      if (n.unc) checkUncertainty(n, compatible.length ? compatible : hits, where)
    }

    // Wording that must accompany special statuses.
    const lower = raw.toLowerCase()
    if (dataNumbers.some((e) => e.status === 'minimum') && !/minimum|at least|m ?sin ?i|lower limit|lower bound/i.test(raw)) {
      fail(where, 'minimum-mass', 'A minimum mass (M sin i) must be described as a minimum ("at least", "minimum mass")')
    }
    if (dataNumbers.some((e) => e.limit === 'upper limit') && !/upper limit|less than|below|at most|<|no more than|under/i.test(raw)) {
      fail(where, 'limit', 'An upper-limit value must be described as a limit ("less than", "upper limit")')
    }
    if (dataNumbers.some((e) => e.limit === 'lower limit') && !/lower limit|greater than|more than|at least|above|>/i.test(raw)) {
      fail(where, 'limit', 'A lower-limit value must be described as a limit ("greater than", "lower limit")')
    }
    if (dataNumbers.some((e) => e.status === 'assumed') && !/assum|fixed|circular|not measured/i.test(raw)) {
      fail(where, 'assumed', 'An assumed value (e.g. eccentricity fixed at 0) must be described as assumed')
    }
    if (dataNumbers.some((e) => e.status === 'estimated') && !/estimat|model|relation|predict|inferred|approximate/i.test(raw)) {
      warn(where, 'estimated', 'Estimated values should be described as estimates')
    }

    // Unsupported data claims: a data label with nothing from the data.
    const dataBasis = bases.some((b) => DATA_BASES.has(b) || b === 'catalog')
    if (dataBasis && !nums.length && !evidenceStrings.some((s) => lower.includes(s))) {
      fail(where, 'unsupported', `Claim labelled ${bases.join('/')} contains no value or catalogue reference from the tool results`)
    }
    if (requireReferences && has('established') && !has('hypothesis') && !concepts.length) {
      fail(where, 'reference', 'General-science claims need a reference: call explain_concept for the concept, or remove the claim')
    }
    if (has('unavailable') && !/unavailable|not (available|known|measured|reported|in the (nasa )?catalog(ue)?)|unknown|no (value|data|measurement)|missing|has not been measured/i.test(raw)) {
      fail(where, 'unavailable', 'A claim labelled unavailable must say the value is unavailable or unknown')
    }

    // Science rules.
    const mentionsPlanet = [...ev.names].some((n) => lower.includes(n.toLowerCase())) || /\b(this|the|that|its) planet\b/i.test(raw)
    const speculative = has('hypothesis') && HEDGE.test(raw)
    // A classification may name its size-class label; nothing more.
    const compText = has('classification') ? raw.replace(TYPE_LABELS, ' ') : raw
    if (COMPOSITION.test(compText) && !negated(compText, COMPOSITION)) {
      const generic = has('established') && !mentionsPlanet
      if (!generic && !speculative) {
        fail(where, 'composition', 'Composition (rocky, ocean, iron core, atmosphere…) is not in the NASA catalogue; only state it as a hedged hypothesis')
      }
    }
    if (has('classification') && !/class|categor|size|visual|type/i.test(raw)) {
      fail(where, 'classification', 'A classification must say it is a size/temperature class, not a measured composition')
    }
    if (has('classification')) checkClassTerms(raw, where)
    if (has('classification') && SIZE_FROM_TEMPERATURE.test(raw) && !THERMAL_TERMS.test(raw)) {
      fail(where, 'classification', "CELESTRIA's size class (rocky world, sub-Neptune, Neptune-like, gas giant) comes from radius alone (mass only when no radius is known); the temperature band is a separate label")
    }
    if (HZ_PLACEMENT.test(raw) && !negated(raw, HZ_PLACEMENT)) {
      const supported = checkZoneClaim(raw, bases, where)
      if (supported === null) {
        const generic = has('established') && !mentionsPlanet && !dataBasis
        if (!generic && !speculative) fail(where, 'habitable-zone', 'Habitable-zone placement comes only from assess_habitability; call it, or state it only as a hedged hypothesis')
      }
    }
    if (HABITABLE_DENIAL.test(raw) && !speculative) {
      fail(where, 'habitability', 'Do not claim a planet is uninhabitable either; the catalogue cannot establish it')
    }
    if (dataBasis && SIZE_CLASS.test(raw)) {
      fail(where, 'classification', 'Size classes (sub-Neptune, super-Earth…) are classifications, not data: put them in a separate claim labelled classification')
    }
    checkRanking(raw, where)
    if ((dataBasis || has('classification')) && INFERENCE.test(raw)) {
      fail(where, 'interpretation', 'Interpretations ("suggesting", "likely"…) are not data: move them to a separate, hedged hypothesis claim')
    }
    if (HABITABLE_ASSERT.test(raw) && !negated(raw, HABITABLE_ASSERT) && !speculative) {
      fail(where, 'habitability', 'Do not claim a planet is habitable or has life; no catalogue data supports it')
    }
    if (EARTH_LIKE.test(raw) && !negated(raw, EARTH_LIKE) && !speculative) {
      fail(where, 'habitability', '"Earth-like" overstates what is known; compare specific measured properties instead')
    }
    if (LIFE.test(raw) && !negated(raw, LIFE)) {
      if (!has('hypothesis') && !(has('established') && !mentionsPlanet)) fail(where, 'life', 'Statements about life must be labelled hypothesis and hedged')
      else if (has('hypothesis') && !HEDGE.test(raw)) fail(where, 'life', 'A hypothesis about life must be hedged (might, could, unknown…)')
    }
  }

  /**
   * Habitable-zone placement claims for a planet with an assess_habitability
   * result must match it. Returns null when no such result applies (the
   * strict default rule then decides), true when supported, false on failure.
   */
  function checkZoneClaim(raw, bases, where) {
    const lower = raw.toLowerCase()
    // Planets first; a host star only when no planet is named (matched with its exact capitalisation).
    let named = [...ev.hz.keys()].filter((n) => containsName(lower, n)).map((n) => [n, ev.hz.get(n)])
    if (!named.length) named = [...ev.hzHosts.keys()].filter((h) => containsName(raw, h, true)).map((h) => [h, ev.hzHosts.get(h)])
    // "It lies within…": only a claim that refers to a planet, never a general statement.
    if (!named.length && ev.hz.size === 1 && /\b(it|its|this planet|the planet)\b/.test(lower) && !mentionsAnyPlanet(lower)) named = [...ev.hz.entries()]
    if (!named.length) return null
    const claimed = claimedPlacements(lower)
    if (!claimed.length) return true // describes the zone (e.g. its boundaries); numbers are checked separately
    if (!bases.some((b) => b === 'calculated' || b === 'hypothesis')) {
      fail(where, 'habitable-zone', 'Habitable-zone placement is a calculated estimate: label the claim calculated')
      return false
    }
    for (const [n, hz] of named) {
      for (const c of claimed) {
        const ok =
          c.kind === 'near'
            ? hz.straddles || hz.orbit?.crossesBoundary
            : hz.placement != null && c.set.includes(hz.placement)
        if (!ok) {
          fail(where, 'habitable-zone', `${n}: the claim "${c.text}" does not match assess_habitability (${hz.placementLabel ?? hz.reason ?? 'placement unavailable'}${hz.straddles ? '; straddles a boundary within uncertainties' : ''})`)
          return false
        }
      }
    }
    return true
  }

  function containsName(text, name, exactCase = false) {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(exactCase ? name : name.toLowerCase())}($|[^\\p{L}\\p{N}])`, 'u').test(text)
  }
  function mentionsAnyPlanet(lower) {
    return [...ev.names].some((n) => n.length > 3 && /\d|\s[a-z]$/.test(n) && containsName(lower, n))
  }

  // A classification may only use the class the tools assigned to the planet named.
  function checkClassTerms(raw, where) {
    const terms = [...raw.matchAll(new RegExp(CLASS_TERMS.source, 'gi'))].map((m) => m[0].toLowerCase().replace(/s$/, ''))
    if (!terms.length) return
    const lower = raw.toLowerCase()
    const named = [...ev.types.keys()].filter((n) => lower.includes(n.toLowerCase()))
    if (!named.length) {
      return fail(where, 'classification', 'Name the planet whose CELESTRIA size class you state (from get_planet or search results)')
    }
    for (const term of terms) {
      const ok = named.some((n) => ev.types.get(n).toLowerCase().includes(term))
      if (!ok) fail(where, 'classification', `"${term}" is not CELESTRIA's class for ${named.join(', ')} (${named.map((n) => ev.types.get(n)).join('; ')})`)
    }
  }

  function checkRanking(raw, where) {
    const lower = raw.toLowerCase()
    const named = [...ev.names].filter((n) => lower.includes(n.toLowerCase()))
    for (const m of raw.matchAll(RANK_RE)) {
      if (m[1]) continue // "one of the closest" is not a rank
      const word = m[2]?.toLowerCase()
      const rank = word ? (ORDINALS[word] ?? parseInt(word, 10)) : 1
      const [sortBy, order] = SUPERLATIVES[m[3].toLowerCase()]
      const candidates = searches.filter((s) => s.sortBy === sortBy && s.order === order)
      const subjects = named.filter((n) => candidates.some((s) => s.names.includes(n)))
      if (!named.length) continue // a general statement, numbers are checked separately
      if (!candidates.length) {
        fail(where, 'ranking', `"${m[0]}" needs a search_planets result sorted by ${sortBy} (${order})`)
        continue
      }
      // The ranked planet is the one named closest before the superlative.
      const before = raw.slice(0, m.index).toLowerCase()
      const subject = [...subjects].sort((a, b) => before.lastIndexOf(b.toLowerCase()) - before.lastIndexOf(a.toLowerCase()))[0]
      if (!subject) {
        fail(where, 'ranking', `"${m[0]}" refers to a planet that is not in the sorted search results`)
        continue
      }
      const ok = candidates.some((s) => s.names.indexOf(subject) + 1 === rank)
      if (!ok) {
        const actual = candidates[0].names.indexOf(subject) + 1
        fail(where, 'ranking', `${subject} is number ${actual} in the search sorted by ${sortBy}, not ${rank}`)
      }
    }
  }

  // Entity attribution (entities.js): each quantity with a physical unit must
  // belong to the object the sentence attributes it to.
  function checkAttribution() {
    const names = { planets: [...ev.planets.values()].map((p) => p.name), stars: [...ev.stars] }
    let carried = null
    let section = -1
    for (const { text, where } of claimTexts) {
      if (where.section !== section) {
        carried = null
        section = where.section
      }
      for (const sentence of splitSentences(text)) {
        const ms = mentions(sentence, names)
        let failed = false
        for (const n of extractNumbers(maskSameLength(sentence, ms))) {
          if (failed || !n.unit || !ATTRIBUTED_UNITS.has(n.unit)) continue
          const candidates = ev.numbers.filter((e) => sameNumber(n.str, e.value) && (!e.unit || e.unit === n.unit))
          if (!candidates.length) continue // the number rule reports it
          const subject = subjectAt(sentence, n.index, ms, carried)
          if (!subject || candidates.some((e) => compatible(subject, e.entity))) continue
          const owners = [...new Set(candidates.map((e) => e.entity && describeEntity(e.entity)).filter(Boolean))]
          fail(
            where,
            'attribution',
            `${n.str} ${n.unit} is given to ${describeEntity(subject)}, but in the tool results it belongs to ${owners.join(', ')}. Attribute every value to the object it was measured for: the Sun is not the planet's host star, and a planet's values are not its star's`,
          )
          failed = true
        }
        carried = ms[0] ?? (ms.length ? carried : /\b(?:it|its)\b/i.test(sentence) ? carried : null)
      }
    }
  }

  // SUNFALL: a volume equivalence, never physical packing (packing.js).
  function checkPacking() {
    const names = [...ev.names]
    const message =
      'Describes the volume comparison as physically fitting, packing or holding planets inside the Sun. It is a volume equivalence only: rewrite as "the Sun has about N times the volume of …" or "equivalent in volume to …", with N only if a tool result gives it'
    for (const hit of packingClaims(claimTexts.map((c) => c.text), { names })) fail(claimTexts[hit.index].where, 'packing', message)
    for (const c of claimTexts) {
      if (packingMisnomers(c.text).length) {
        fail(c.where, 'packing', 'A volume equivalence assumes no packing at all ("perfect packing" would still leave gaps): say it compares mathematical volumes without modelling physical arrangement or packing gaps')
      }
    }
    answer.sections.forEach((section, si) => {
      if (typeof section?.title === 'string' && packingClaims([section.title], { names }).length) {
        fail({ section: si, text: section.title.slice(0, 80) }, 'packing', message)
      }
    })
  }

  // No SUNFALL count unless a tool result contains it: number words always
  // fail (no tool writes them); digits must match the evidence.
  function checkVolumeCount(raw, where) {
    const message = 'Gives a volume-equivalence count that no tool result provides. Do not calculate or estimate it: explain the comparison without a planet-specific number'
    if (volumeCounts(raw).length) return fail(where, 'volume-count', message)
    for (const s of splitSentences(raw)) {
      if (!isVolumeEquivalence(s)) continue
      const unsupported = extractNumbers(s).some((n) => !ev.numbers.some((e) => sameNumber(n.str, e.value)))
      if (unsupported) return fail(where, 'volume-count', message)
    }
  }

  // Titles are headings, not claims: no numbers, links, citations or science assertions.
  function checkTitle(title, where) {
    if (typeof title !== 'string' || title.length > 80) return fail(where, 'schema', 'Section titles must be strings of at most 80 characters')
    const plain = stripNames(title, ev.names)
    if (extractNumbers(plain).length) fail(where, 'title', 'Section titles must not contain values; put numbers in claims')
    if (MD_LINK_RE.test(title) || URL_RE.test(title)) fail(where, 'link', 'Section titles must not contain links')
    MD_LINK_RE.lastIndex = 0
    URL_RE.lastIndex = 0
    if (CITATION_RE.test(title)) fail(where, 'citation', 'Section titles must not contain citations')
    CITATION_RE.lastIndex = 0
    for (const [re, rule] of [[HABITABLE_ASSERT, 'habitability'], [EARTH_LIKE, 'habitability'], [COMPOSITION, 'composition']]) {
      if (re.test(title) && !negated(title, re)) fail(where, rule, 'Section titles must not make scientific claims')
    }
    // A heading may name the habitable zone, but not place a planet in or out of it.
    if (claimedPlacements(title.toLowerCase()).length) fail(where, 'habitable-zone', 'Section titles must not state a habitable-zone placement')
  }

  function checkUncertainty(n, candidates, where) {
    const withUnc = candidates.filter((e) => e.uncertainty)
    if (!withUnc.length) return fail(where, 'uncertainty', `${n.str} has no uncertainty in the data; do not add one`)
    const ok = withUnc.some((e) => {
      const { plus, minus } = e.uncertainty
      if (n.unc.sym) {
        if (!(sameNumber(n.unc.sym, plus) || sameNumber(n.unc.sym, minus))) return false
        const asym = !(sameNumber(n.unc.sym, plus) && sameNumber(n.unc.sym, minus))
        if (asym) warn(where, 'uncertainty', `${n.str} ±${n.unc.sym}: the data uncertainty is asymmetric (+${plus} −${minus}); show both sides`)
        return true
      }
      return sameNumber(n.unc.plus, plus) && sameNumber(n.unc.minus, minus)
    })
    if (!ok) {
      const e = withUnc[0]
      fail(where, 'uncertainty', `${n.str}${n.unc.sym ? ` ±${n.unc.sym}` : ` +${n.unc.plus} −${n.unc.minus}`} does not match the data uncertainty (+${e.uncertainty.plus} −${e.uncertainty.minus}); copy it exactly and never average asymmetric errors`)
    }
  }

  // Remaining links and sources for the UI (from evidence only).
  const links = [...referenced].map((id) => ev.planets.get(id))
  return { ok: errors.length === 0, errors, warnings, checkedNumbers: checked, links, sources: [...usedSources.values()] }
}
