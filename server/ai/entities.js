// Entity attribution for AI answers — owner: AI (implemented by LEAD). Pure.
//
// The validator checks that each quoted number exists in the tool results.
// This module checks WHOSE number it is: a value that belongs to TRAPPIST-1
// (the host star) must not be presented as the Sun's, a planet's radius as
// its star's, one planet's period as another's.
//
// Evidence numbers carry the entity they came from (validate.js tags them:
// planet, star/system, Earth, Jupiter, or null when unknown). Here a claim's
// sentences are scanned for entity mentions — named planets and host stars,
// the Sun, Earth, Jupiter, "the star", "the planet" — and each quantity with
// a physical unit is attributed to the subject the sentence gives it:
//   1. the nearest entity named before it in the same clause;
//   2. in a relative clause ("…, whose radius is …"), the nearest before it
//      in the sentence;
//   3. otherwise the sentence's first-named entity (its grammatical subject);
//   4. "it/its" with no entity named: the previous sentence's subject.
// A quantity fails when every matching evidence value belongs to a different
// entity. Values with an unknown owner never fail; unitless numbers (years,
// counts) are not checked. The Sun matches only values owned by the Sun,
// which no catalogue tool provides.

// Units of physical quantities whose owner matters.
export const ATTRIBUTED_UNITS = new Set(['R⊕', 'M⊕', 'R_J', 'M_J', 'R☉', 'M☉', 'S⊕', 'K', 'celsius', 'days', 'hours', 'Gyr', 'years', 'AU', 'pc', 'light-years', 'g/cm³', 'm/s²', '°'])

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Fixed bodies. Earth/Sun/Jupiter used as units ("1.3 Earth masses",
// "Sun radii") are not mentions: they directly follow a number.
const UNIT_WORDS = String.raw`(?:radii|radius|masses|mass|years?|days?|insolation|flux)\b`
const FIXED = [
  { kind: 'sun', name: 'the Sun', re: new RegExp(String.raw`\b(?:the|our)\s+Sun\b(?![-\w])|\bSun['’]s\b|\bthe\s+solar\s+(?:radius|mass|temperature|luminosity|surface)\b`, 'gi') },
  { kind: 'earth', name: 'Earth', re: new RegExp(String.raw`\bEarth\b(?![-\w])(?!['’]?s?\s+${UNIT_WORDS})|\bEarth['’]s\b`, 'g') },
  { kind: 'jupiter', name: 'Jupiter', re: new RegExp(String.raw`\bJupiter\b(?![-\w])(?!['’]?s?\s+${UNIT_WORDS})|\bJupiter['’]s\b`, 'g') },
  { kind: 'star', name: null, re: /\b(?:host\s+)?stars?\b(?![-\w])/gi },
  { kind: 'planet', name: null, re: /\b(?:the|this|that)\s+(?:exo)?planet\b/gi },
]

/**
 * Entity mentions in a text, longest names first so "TRAPPIST-1" does not
 * match inside "TRAPPIST-1 e". Mentions right after a number are units.
 * @param {string} text
 * @param {{ planets: string[], stars: string[] }} names
 * @returns {{ index: number, end: number, kind: string, name: string|null }[]}
 */
export function mentions(text, { planets = [], stars = [] }) {
  const taken = new Array(text.length).fill(false)
  const out = []
  const claim = (re, kind, name) => {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      const i = m.index
      const end = i + m[0].length
      if (taken.slice(i, end).some(Boolean)) continue
      if (/\d[\d,.]*\s*$/.test(text.slice(Math.max(0, i - 12), i)) && kind !== 'planet') continue // "1.3 Earth masses"
      taken.fill(true, i, end)
      out.push({ index: i, end, kind, name })
    }
  }
  const named = [...planets.map((n) => [n, 'planet']), ...stars.map((n) => [n, 'star'])].filter(([n]) => n && n.length >= 2).sort((a, b) => b[0].length - a[0].length)
  for (const [n, kind] of named) claim(new RegExp(String.raw`(?<![\w-])${esc(n)}(?![\w-])`, 'g'), kind, n)
  for (const f of FIXED) claim(f.re, f.kind, f.name)
  return out.sort((a, b) => a.index - b.index)
}

const CLAUSE_BREAK = /[,;:()—–]|\s(?:while|whereas|but|unlike|compared (?:with|to)|than)\s/gi

/**
 * The entity a quantity at `pos` is attributed to, or null when unclear.
 * @param {string} sentence
 * @param {number} pos
 * @param {ReturnType<typeof mentions>} ms
 * @param {object|null} carried  previous sentence's subject, for "it/its"
 */
export function subjectAt(sentence, pos, ms, carried = null) {
  if (!ms.length) return /\b(?:it|its)\b/i.test(sentence) ? carried : null
  // "a 3,200 K star", "a 1.1 R⊕ planet": the noun right after the quantity.
  const next = ms.find((x) => x.index > pos)
  if (next && next.index - pos <= 24 && !/\b(?:is|are|was|has|have|of|with|and|than|while|its|their)\b/i.test(sentence.slice(pos, next.index))) return next
  // Clause containing the quantity.
  let start = 0
  CLAUSE_BREAK.lastIndex = 0
  let m
  while ((m = CLAUSE_BREAK.exec(sentence)) && m.index < pos) start = m.index + m[0].length
  const before = ms.filter((x) => x.end <= pos)
  const inClause = before.filter((x) => x.index >= start)
  if (inClause.length) return inClause.at(-1)
  if (/^\s*(?:whose|which|that|who)\b/i.test(sentence.slice(start, pos))) return before.at(-1) ?? ms[0]
  return ms[0]
}

/** Whether an evidence entity can be what the claim's subject refers to. */
export function compatible(subject, entity) {
  if (!entity) return true // unknown owner: never fails
  switch (subject.kind) {
    case 'sun':
      return entity.kind === 'sun'
    case 'earth':
      return entity.kind === 'earth'
    case 'jupiter':
      return entity.kind === 'jupiter'
    case 'planet':
      return entity.kind === 'planet' && (subject.name == null || entity.name === subject.name)
    case 'star':
      return entity.kind === 'star' && (subject.name == null || entity.name == null || entity.name === subject.name)
    default:
      return true
  }
}

export const describeEntity = (e) => (e.kind === 'sun' ? 'the Sun' : e.name ?? (e.kind === 'star' ? 'the host star' : 'the planet'))
