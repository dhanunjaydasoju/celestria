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
//
// It never fixes an answer: it reports errors so the caller can retry or
// fall back. Fully deterministic; no model involved.

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
  ['%', ['%', 'percent', 'per cent']],
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
const CONSTANTS = [[365.25, 'days'], [5.51, 'g/cm³'], [317.83, 'M⊕'], [11.209, 'R⊕'], [3.26156, 'light-years'], [9.81, 'm/s²'], [9.80665, 'm/s²']]

/**
 * Index every number, label, source, link and planet in the tool results.
 * @param {{ name: string, args?: object, result: object }[]} toolResults
 */
export function buildEvidence(toolResults, { question = '' } = {}) {
  const ev = { numbers: [], strings: new Set(), names: new Set(), planets: new Map(), sources: new Map(), urls: new Set() }
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
    for (const n of extractNumbers(stripNames(s, ev.names))) addNumber(n.value, n.unit, status === 'established' ? 'established' : 'reference')
  }

  const walk = (node, status, unit, key) => {
    if (node == null) return
    if (typeof node === 'number') return void addNumber(node, unit, status ?? 'catalog')
    if (typeof node === 'string') return void (key === 'source' ? addSource(node) : addText(node, status, key))
    if (Array.isArray(node)) return void node.forEach((n) => walk(n, status, unit, key))
    if (typeof node !== 'object') return

    if (typeof node.name === 'string' && typeof node.id === 'string' && !ev.planets.has(node.id)) {
      const links = planetLinks({ id: node.id, name: node.name, host: node.host ?? '' })
      ev.planets.set(node.id, { id: node.id, name: node.name, profileUrl: links.profileUrl, nasaOverviewUrl: links.nasaOverviewUrl })
    }
    for (const k of ['name', 'host', 'planet']) if (typeof node[k] === 'string') ev.names.add(node[k])
    if (typeof node.label === 'string' && typeof node.url === 'string') addSource(node.label, node.url)

    const own = typeof node.status === 'string' && PROVENANCE.has(node.status) ? node.status : node.basis === 'established' ? 'established' : status
    const ownUnit = typeof node.unit === 'string' ? node.unit : unit
    if (typeof node.value === 'number' && own) {
      addNumber(node.value, ownUnit, own, { uncertainty: node.uncertainty ?? null, limit: node.limit ?? null, source: typeof node.source === 'string' ? node.source : node.source?.label })
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'value' || k === 'uncertainty' || k === 'status' || k === 'unit') continue
      // Keys of comparison maps are planet names.
      if (k === 'values' || k === 'relativeToEarth' || k === 'relativeToFirst') Object.keys(v ?? {}).forEach((n) => ev.names.add(n))
      walk(v, own, ownUnit, k)
    }
  }
  // Names first so numbers inside names are not indexed as values.
  const collectNames = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(collectNames)
    for (const k of ['name', 'host', 'planet']) if (typeof node[k] === 'string') ev.names.add(node[k])
    Object.values(node).forEach(collectNames)
  }
  for (const r of toolResults) collectNames(r.result)
  for (const r of toolResults) walk(r.result, null, null, null)
  for (const [value, unit] of CONSTANTS) addNumber(value, unit, 'constant')
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

function stripNames(text, names) {
  let s = String(text ?? '')
  for (const n of [...names].sort((a, b) => b.length - a.length)) if (/\d/.test(n)) s = s.replace(new RegExp(esc(n), 'gi'), ' ⟨name⟩ ')
  return s.replace(DESIGNATION_RE, ' ⟨name⟩ ')
}

const normLabel = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const HEDGE = /\b(might|may|could|possibly|perhaps|if\b|would|speculat\w*|hypothe\w*|uncertain|unknown|not (yet )?known|unconfirmed|cannot (be )?(say|determine|confirm)|no (direct )?evidence)/i
const NEGATION = /\b(not|no|cannot|can't|isn't|aren't|unknown|unclear|without|never|neither|nor|doesn't|does not|don't|unconfirmed|undetermined|unproven)\b/i
const COMPOSITION = /\b(rocky (planet|world|surface|composition|core)|is rocky|are rocky|iron[- ](core|rich)|metallic core|silicate|(global |surface |deep )?ocean(s)?\b|water[- ]?world|water-rich|hycean|lava (world|ocean|planet)|magma ocean|molten surface|ice giant composition|made (mostly )?of|composed (mostly )?of|its composition|hydrogen(-rich)? (envelope|atmosphere)|thick atmosphere|has an atmosphere|atmosphere (of|contains|rich))/i
const HZ_PLACEMENT = /\b(in|within|inside|lies in|located in|orbits (in|within)|sits in|falls in)\s+(the\s+|its\s+(star'?s?\s+)?)?(conservative\s+|optimistic\s+)?(habitable|goldilocks)\s+zone\b/i
const HABITABLE_ASSERT = /\b((is|are|be|being|was)\s+(a\s+)?(potentially\s+|likely\s+|probably\s+|possibly\s+)?habitable|habitable\s+(planet|world|exoplanet)|(has|have|harbou?rs?|supports?|hosts?|sustains?)\s+(alien\s+|extraterrestrial\s+)?life)\b/i
const LIFE = /\b(life|living organisms|biosignatures?|inhabited|aliens?|extraterrestrial)\b/i
const EARTH_LIKE = /\b(earth[- ](like|twin)|second earth|earth 2\.0)\b(?!\s+(size|radius|mass|in size|in radius|in mass))/i

const TYPE_LABELS = /\b(rocky world|sub-neptune|neptune-like|gas giant)\b/gi

const sentences = (text) => text.split(/(?<=[.!?;])\s+/)
const negated = (text, re) => sentences(text).filter((s) => re.test(s)).every((s) => NEGATION.test(s.slice(0, s.search(re) + 40)))

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * @param {{ sections: { title?: string, claims: { text: string, basis: string, refs?: string[] }[] }[], planets?: string[] }} answer
 * @param {{ name: string, args?: object, result: object }[]} toolResults
 * @param {{ question?: string }} [opts]
 */
export function validateAnswer(answer, toolResults, { question = '' } = {}) {
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
  let checked = 0

  answer.sections.forEach((section, si) => {
    const claims = section?.claims
    if (!Array.isArray(claims) || !claims.length) return fail({ section: si }, 'schema', 'Each section needs a non-empty "claims" array')
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
        if (!ev.planets.has(id)) fail(where, 'planet-ref', `Planet id "${id}" is not in the tool results`)
        else referenced.add(id)
      }
      checkClaim(claim.text, bases, where)
    })
  })
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
      const label = normLabel(`${m[1]} ${m[2]}`)
      const hit = [...labelsNorm.entries()].find(([k]) => k === label || k.startsWith(label) || label.startsWith(k))
      if (hit) usedSources.set(hit[1].label, hit[1])
      else fail(where, 'citation', `Citation "${m[0].trim()}" does not match any source in the tool results`)
    }
    text = text.replace(CITATION_RE, ' ⟨cite⟩ ')
    for (const s of ev.sources.values()) if (raw.includes(s.label)) usedSources.set(s.label, s)

    // Dates are only allowed if the tools produced them (or the user gave them).
    for (const d of text.match(ISO_DATE_RE) ?? []) {
      const ok = [...ev.strings].some((s) => s.startsWith(d)) || question.includes(d.slice(0, 10))
      if (!ok) fail(where, 'date', `Date ${d} is not in the tool results`)
    }
    text = text.replace(ISO_DATE_RE, ' ⟨date⟩ ')

    const body = stripNames(text, ev.names).replace(/^\s*\d+[.)]\s/, ' ').replace(/\b\d+(st|nd|rd|th)\b/g, ' ')
    const nums = extractNumbers(body)
    const dataNumbers = []

    for (const n of nums) {
      checked++
      const scale = n.unit === '%' ? 100 : 1
      const unitWanted = n.unit === '%' ? '×' : n.unit
      const valueHits = ev.numbers.filter((e) => sameNumber(n.str, e.value, scale))
      const hits = valueHits.filter((e) => unitCompatible(unitWanted, e.unit))
      if (!hits.length) {
        const otherUnits = [...new Set(valueHits.map((e) => e.unit).filter(Boolean))]
        if (otherUnits.length && n.unit) {
          fail(where, 'unit', `${n.str} ${n.unit}: the data has this number in ${otherUnits.join(', ')}, not ${n.unit}`)
        } else if (n.unit && !ev.numbers.some((e) => e.unit === unitWanted)) {
          fail(where, 'unit', `${n.str} ${n.unit}: no tool returned values in ${n.unit}; do not convert units yourself`)
        } else if (!n.unit && Number.isInteger(n.value) && Math.abs(n.value) <= 12 && !n.str.includes('.')) {
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
    if (HZ_PLACEMENT.test(raw) && !negated(raw, HZ_PLACEMENT)) {
      const generic = has('established') && !mentionsPlanet
      if (!generic && !speculative) fail(where, 'habitable-zone', 'Habitable-zone placement is not computed by the tools; state it only as a hedged hypothesis')
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
