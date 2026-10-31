// Tool context: read-only catalogue indexes and planet-name resolution —
// owner: AI (implemented by LEAD in M5 Phase 1).
//
// Built from CANONICAL planets only (catalogStore.get().planets). This
// module never touches the analysis/imputation layer (CLAUDE.md §5a).

// Greek letters and constellation genitives as used in NASA host names
// ("alf Tau", "Proxima Cen", "55 Cnc").
const GREEK = {
  alpha: 'alf', beta: 'bet', gamma: 'gam', delta: 'del', epsilon: 'eps', zeta: 'zet', theta: 'tet', iota: 'iot',
  kappa: 'kap', lambda: 'lam', omicron: 'omi', sigma: 'sig', upsilon: 'ups', omega: 'ome', xi: 'ksi',
}
export const CONSTELLATIONS = {
  andromedae: 'and', aquarii: 'aqr', aquilae: 'aql', arae: 'ara', arietis: 'ari', aurigae: 'aur', bootis: 'boo',
  cancri: 'cnc', 'canis majoris': 'cma', 'canum venaticorum': 'cvn', capricorni: 'cap', cassiopeiae: 'cas',
  centauri: 'cen', cephei: 'cep', ceti: 'cet', coronae: 'cr', 'coronae borealis': 'crb', corvi: 'crv', cygni: 'cyg',
  delphini: 'del', doradus: 'dor', draconis: 'dra', eridani: 'eri', geminorum: 'gem', gruis: 'gru', herculis: 'her',
  hydrae: 'hya', leonis: 'leo', 'leonis minoris': 'lmi', leporis: 'lep', librae: 'lib', lyrae: 'lyr', mensae: 'men',
  ophiuchi: 'oph', orionis: 'ori', pegasi: 'peg', persei: 'per', phoenicis: 'phe', pictoris: 'pic', piscium: 'psc',
  'piscis austrini': 'psa', puppis: 'pup', reticuli: 'ret', sagittarii: 'sgr', scorpii: 'sco', serpentis: 'ser',
  tauri: 'tau', trianguli: 'tri', tucanae: 'tuc', 'ursae majoris': 'uma', 'ursae minoris': 'umi', velorum: 'vel',
  virginis: 'vir', volantis: 'vol',
}
/** Common names → catalogue host names (system-level aliases). */
const HOST_ALIASES = {
  'kepler-90': 'KOI-351',
  "barnard's star": "Barnard's star",
  'barnards star': "Barnard's star",
}

const LONGEST_FIRST = (obj) => Object.entries(obj).sort((a, b) => b[0].length - a[0].length)
const GREEK_RE = new RegExp(`\\b(${Object.keys(GREEK).join('|')})\\b`, 'g')
const CONST_ENTRIES = LONGEST_FIRST(CONSTELLATIONS)

/** Canonical form of a name: lowercase, expanded abbreviations, ASCII. */
export function canonicalName(text) {
  let s = String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .trim()
  s = s.replace(GREEK_RE, (g) => GREEK[g])
  for (const [full, abbr] of CONST_ENTRIES) s = s.replace(new RegExp(`\\b${full}\\b`, 'g'), abbr)
  return s.replace(/\s+/g, ' ')
}

/** Compact key for matching: canonical form without spaces or punctuation. */
export const nameKey = (text) => canonicalName(text).replace(/[^a-z0-9.]+/g, '')

function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    let rowMin = prev[0]
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
      rowMin = Math.min(rowMin, prev[j])
    }
    if (rowMin > max) return max + 1
  }
  return prev[b.length]
}

/**
 * @param {import('../../../src/contracts/planet.js').Planet[]} planets  canonical planets
 * @param {{ meta?: object, now?: () => Date }} [opts]  catalogue meta; clock (tests)
 */
export function createToolContext(planets, { meta = null, now } = {}) {
  const byId = new Map()
  const byKey = new Map()
  const byHost = new Map()
  const hostByKey = new Map()
  for (const p of planets) {
    byId.set(p.id, p)
    byKey.set(nameKey(p.name), p)
    byHost.set(p.host, [...(byHost.get(p.host) ?? []), p])
    hostByKey.set(nameKey(p.host), p.host)
  }
  for (const [alias, host] of Object.entries(HOST_ALIASES)) if (byHost.has(host)) hostByKey.set(nameKey(alias), host)
  const planetKeys = [...byKey.keys()]
  return { planets, meta, now, byId, byKey, byHost, hostByKey, planetKeys }
}

const summary = (p) => ({ id: p.id, name: p.name, host: p.host, profileUrl: `/planet/${p.id}` })

/**
 * Resolve a user-supplied planet name. Never guesses: a typo returns
 * suggestions, a host name with several planets returns candidates.
 * @returns {{ status: 'found', planet: object, resolvedFrom?: string }
 *         | { status: 'ambiguous', candidates: object[], reason: string }
 *         | { status: 'not_found', suggestions: object[] }}
 */
export function resolvePlanet(ctx, query) {
  const q = String(query ?? '').trim()
  if (!q) return { status: 'not_found', suggestions: [] }
  if (ctx.byId.has(q)) return { status: 'found', planet: ctx.byId.get(q) }
  const key = nameKey(q)
  if (ctx.byKey.has(key)) return { status: 'found', planet: ctx.byKey.get(key) }

  // "<host or alias> <suffix>", e.g. "Kepler-90 b" → "KOI-351 b".
  for (const [hostKey, host] of ctx.hostByKey) {
    if (key.startsWith(hostKey) && key.length > hostKey.length) {
      const suffix = key.slice(hostKey.length)
      const hit = (ctx.byHost.get(host) ?? []).find((p) => nameKey(p.name).endsWith(suffix) && nameKey(p.name).length - suffix.length >= 2)
      if (hit) return { status: 'found', planet: hit, resolvedFrom: `alias of ${host}` }
    }
  }

  // A host (or alias) name.
  const host = ctx.hostByKey.get(key)
  if (host) {
    const list = ctx.byHost.get(host)
    if (list.length === 1) return { status: 'found', planet: list[0], resolvedFrom: `host star ${host} (only one planet)` }
    return { status: 'ambiguous', reason: `${host} is a star with ${list.length} planets`, candidates: list.map(summary) }
  }

  // Typos: suggest, never auto-select.
  const scored = []
  for (const k of ctx.planetKeys) {
    const d = editDistance(key, k, 2)
    if (d <= 2) scored.push([d, ctx.byKey.get(k)])
  }
  if (!scored.length) {
    for (const k of ctx.planetKeys) if (k.startsWith(key) && key.length >= 3) scored.push([3, ctx.byKey.get(k)])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
  return { status: 'not_found', suggestions: scored.slice(0, 5).map(([, p]) => summary(p)) }
}

/** Resolve a host/system name, accepting a planet name or alias too. */
export function resolveHost(ctx, query) {
  const key = nameKey(query)
  const host = ctx.hostByKey.get(key)
  if (host) return { status: 'found', host }
  const planet = resolvePlanet(ctx, query)
  if (planet.status === 'found') return { status: 'found', host: planet.planet.host, resolvedFrom: `planet ${planet.planet.name}` }
  return { status: 'not_found', suggestions: planet.status === 'not_found' ? planet.suggestions : planet.candidates }
}

/**
 * Planets and systems named in free text (for pre-retrieval in Phase 2).
 * Matches whole names on the canonical form, longest first.
 */
export function findMentions(ctx, text) {
  const canon = ` ${canonicalName(text).replace(/[^a-z0-9.'\s-]+/g, ' ')} `
  const planets = []
  const hosts = []
  const taken = []
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a)
  const names = [
    ...ctx.planets.map((p) => [canonicalName(p.name), 'planet', p]),
    ...[...ctx.byHost.keys()].map((h) => [canonicalName(h), 'host', h]),
    ...Object.entries(HOST_ALIASES).filter(([, h]) => ctx.byHost.has(h)).map(([a, h]) => [canonicalName(a), 'host', h]),
  ].sort((a, b) => b[0].length - a[0].length)
  for (const [name, kind, value] of names) {
    if (name.length < 3) continue
    let from = 0
    for (;;) {
      const i = canon.indexOf(name, from)
      if (i < 0) break
      const before = canon[i - 1]
      const after = canon[i + name.length]
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after ?? ' ') && !overlaps(i, i + name.length)) {
        taken.push([i, i + name.length])
        if (kind === 'planet') planets.push(value)
        else if (!hosts.includes(value)) hosts.push(value)
        break
      }
      from = i + 1
    }
  }
  return { planets, hosts }
}
