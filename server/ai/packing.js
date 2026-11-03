// SUNFALL safeguards for the AI answer validator — owner: AI (implemented by
// LEAD). Pure and deterministic.
//
// SUNFALL compares volumes: N = (R☉/R)³ is how many planet VOLUMES equal the
// Sun's volume. It is not a packing count: spheres cannot fill a sphere
// without gaps. Two checks keep the AI astronomer honest about it:
//
//   packingClaims()  a sentence (or two adjacent claims) where the Sun is a
//                    container and planets are the contents: "fit inside",
//                    "pack into", "the Sun could hold / has room for", …
//                    Contextual: the Sun as container, planets as contents
//                    and a containing verb must occur together. "Inside",
//                    "contain" or "hold" alone are never enough, orbital and
//                    gravitational senses are ignored, and negated
//                    explanations ("cannot be packed…") are allowed.
//   volumeCounts()   a volume-equivalence count written with number words
//                    ("a million Earth volumes", "1.3 million times the
//                    volume"): no tool provides SUNFALL counts, and digits
//                    alone ("1") would let the number check pass them.

// The Sun as a container: "the Sun", "our Sun", "the Sun's volume/interior",
// "the solar interior". Not "Sun-like", "Sun's habitable zone", etc.
const SUN = /\b(?:the|our)\s+sun\b(?![-\w])(?!['’]s\s+(?!volume|interior|insides?|globe|sphere)\w)|\bsolar\s+(?:interior|globe|volume)\b/i

// Planets as contents: planets, worlds, Earths, copies, "of them", named planets.
const CONTENTS_WORDS = String.raw`planets?|worlds?|earths?|jupiters?|neptunes?|copies|spheres|bodies|balls|marbles|of them|of these|of those|such planets|these worlds`

// Containing verbs and phrases (the planet goes in, or the Sun takes it in).
const CONTAINING = new RegExp(
  String.raw`\b(?:fit(?:s|ted|ting)?|pack(?:s|ed|ing)?|cram(?:s|med|ming)?|squeez(?:e|es|ed|ing)|stuff(?:s|ed|ing)?|hold(?:s|ing)?|held|contain(?:s|ed|ing)?|accommodat(?:e|es|ed|ing)|hous(?:e|es|ed|ing)|stor(?:e|es|ed|ing)|swallow(?:s|ed|ing)?|fill(?:s|ed|ing)?|load(?:s|ed|ing)?|pour(?:s|ed|ing)?|(?:room|space|capacity)\s+(?:for|to)|(?:go|goes|went|placed?|places|put|puts|drop(?:ped|s)?|insert(?:ed|s)?|tuck(?:ed|s)?)\s+(?:in|into|inside|within))\b`,
  'i',
)

// Senses of hold/contain/inside that are not packing.
const NOT_PACKING = /\b(?:orbit\w*|gravit\w*|tidal\w*|attract\w*|in place|habitable zone|best[- ]fit|fit(?:ted)?\s+(?:to|with|the|a|by)\s+(?:the\s+)?(?:data|model|observations?|curve|light ?curve))/i

// Explanations of what the comparison is NOT are allowed.
const NEGATION = /\b(?:not|never|cannot|can['’]?t|couldn['’]?t|wouldn['’]?t|doesn['’]?t|isn['’]?t|aren['’]?t|no\s+physical|rather than|instead of|unlike|impossible|without gaps)\b/i

// A pronoun standing for the Sun in a follow-up claim ("It could hold…").
const SUN_PRONOUN = /\b(?:it|its interior|inside it|into it|in it|within it|there|that volume|this volume|the star)\b/i

const sentences = (text) => String(text).split(/(?<=[.!?;])\s+/).filter(Boolean)
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function contentsRe(names = []) {
  const extra = names.filter((n) => n && n.length >= 3).map(escape)
  return new RegExp(String.raw`\b(?:${[CONTENTS_WORDS, ...extra].join('|')})\b`, 'i')
}

/** A packing sentence: Sun as container + planets as contents + containing verb, not negated. */
function isPacking(sentence, contents, { sunViaPronoun = false } = {}) {
  const hasSun = SUN.test(sentence) || (sunViaPronoun && SUN_PRONOUN.test(sentence))
  if (!hasSun || !contents.test(sentence) || !CONTAINING.test(sentence)) return false
  if (NOT_PACKING.test(sentence) || NEGATION.test(sentence)) return false
  return true
}

/**
 * Packing claims in an answer's texts. Each text is checked sentence by
 * sentence, and each adjacent pair of texts is checked for a claim that names
 * the Sun followed by one that packs planets into "it".
 * @param {string[]} texts      claim texts in order (and titles)
 * @param {{ names?: string[] }} [opts]  planet names from the evidence (also contents)
 * @returns {{ index: number, text: string }[]}  index of the offending text
 */
export function packingClaims(texts, { names = [] } = {}) {
  const contents = contentsRe(names)
  const found = []
  texts.forEach((text, i) => {
    const parts = sentences(text)
    const own = parts.some((s) => isPacking(s, contents))
    // Within one claim: "Picture the Sun. It could hold a million Earths."
    const chained = !own && parts.some((s, k) => k > 0 && parts.slice(0, k).some((p) => SUN.test(p)) && isPacking(s, contents, { sunViaPronoun: true }))
    // Across claims: the previous claim names the Sun, this one packs into "it".
    const prev = i > 0 ? texts[i - 1] : ''
    const across = !own && !chained && SUN.test(prev) && !SUN.test(text) && parts.some((s) => isPacking(s, contents, { sunViaPronoun: true }))
    if (own || chained || across) found.push({ index: i, text })
  })
  return found
}

// "Assumes perfect packing": a volume equivalence assumes no packing at all,
// and "perfect packing" usually means the densest real packing (about 74 %),
// which still leaves gaps. Allowed only when negated in the same clause.
const MISNOMER = /\b(?:assum\w*|impl(?:y|ies|ying)|requir\w*|treat\w*\s+\w+\s+as|as if)\b[^.;]{0,30}?\b(?:perfect|ideal|tight|complete|gap-?free|100\s?%)\s+(?:sphere\s+)?packing\b|\bperfect(?:ly)?\s+pack(?:ing|ed)\b/i
const CLAUSE_NEGATION = /\b(?:not|never|no|without|nor)\b|n['’]t\b/i

/**
 * Sentences that describe a volume equivalence as some kind of (perfect)
 * packing.
 * @param {string} text
 * @returns {string[]}
 */
export function packingMisnomers(text) {
  return sentences(text).filter((s) => {
    const m = MISNOMER.exec(s)
    if (!m) return false
    const clauseStart = Math.max(s.lastIndexOf(',', m.index), s.lastIndexOf(' and ', m.index), s.lastIndexOf(' but ', m.index), 0)
    return !CLAUSE_NEGATION.test(s.slice(clauseStart, m.index))
  })
}

// ── Volume counts ──────────────────────────────────────────────────────────

// A volume equivalence: "times the volume", "volumes of", "Earth volumes",
// "volume-equivalent", "equivalent in volume", "volume ratio".
const VOLUME_EQUIV = /\b(?:times\s+(?:(?:the|its|their|a|an)\s+)?(?:[\w-]+['’]s\s+)?volume|volumes?\s+of|(?:earth|planet|jupiter|neptune|[\w-]+)[- ]volumes\b|volume[- ]equivalent|equivalent\s+in\s+volume|volume\s+ratio)/i

// Number words that make a count ("a million", "1.3 million", "thousands").
const COUNT_WORDS = /\b(?:\d[\d,.]*\s*)?(?:hundreds?|thousands?|millions?|billions?|trillions?|dozens?)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|a|an)\s+(?:hundred|thousand|million|billion|trillion)\b/i

/**
 * Volume-equivalence sentences that give a count in number words. Digit-only
 * counts are left to the validator's number check (they must appear in a
 * tool result).
 * @param {string} text
 * @returns {string[]} offending sentences
 */
export function volumeCounts(text) {
  return sentences(text).filter((s) => VOLUME_EQUIV.test(s) && COUNT_WORDS.test(s))
}

/** Is this sentence a volume equivalence (for the digit-count check)? */
export const isVolumeEquivalence = (sentence) => VOLUME_EQUIV.test(sentence)
export const splitSentences = sentences
