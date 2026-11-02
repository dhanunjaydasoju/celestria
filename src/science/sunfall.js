// SUNFALL volume equivalence — owner: LEAD (Stage S1). Pure and deterministic.
//
// How many planet volumes equal the Sun's volume:
//
//   N = (R☉ / R)³,   R in Earth radii,   R☉ = 695,700 km / 6,371.0 km ≈ 109.198 R⊕
//
// R☉ is the IAU 2015 nominal solar radius and R⊕ the Earth volumetric mean
// radius, the same constants as earthReference.js. This is a VOLUME
// EQUIVALENCE, not a packing count: identical spheres cannot fill a larger
// sphere without gaps.
//
// Radius handling (CLAUDE.md §1, §5a), via compareCell():
// - measured, NASA-calculated and model-based/estimated radii give a value,
//   each with its own provenance wording;
// - an upper limit R < r gives N > (R☉/r)³; a lower limit R > r gives
//   N < (R☉/r)³. Bounds are rounded in the safe direction;
// - missing, imputed, non-finite and non-positive radii give no number.
// Uncertainty is propagated exactly through the cube (no linearisation):
//   N_low = (R☉/(R + σ₊))³,  N_high = (R☉/(R − σ₋))³  (open when R − σ₋ ≤ 0).

import { COMPARE_GROUPS, compareCell, interval } from './compare.js'
import { EARTH_RADIUS_KM, SUN_RADIUS_KM } from './earthReference.js'

/** Solar radius in Earth radii (R☉/R⊕). */
export const SUN_RADIUS_EARTH = SUN_RADIUS_KM / EARTH_RADIUS_KM

export const SUNFALL_CONSTANTS = Object.freeze({
  sunRadiusKm: SUN_RADIUS_KM,
  earthRadiusKm: EARTH_RADIUS_KM,
  sunRadiusEarth: SUN_RADIUS_EARTH,
  formula: 'N = (R☉ / R)³',
  sources: Object.freeze([
    'Solar radius: IAU 2015 Resolution B3 nominal value, 695,700 km',
    'Earth radius: NASA NSSDCA Earth Fact Sheet volumetric mean radius, 6,371.0 km',
  ]),
})

export const SUNFALL_WORDING = Object.freeze({
  equivalence: 'This is a volume equivalence: the Sun’s volume divided by the planet’s volume.',
  packing:
    'It is not a packing count. Identical spheres cannot fill a larger sphere without gaps, so fewer whole planets would physically fit inside the Sun.',
  sun: 'The Sun here is our Sun (radius 695,700 km), not the planet’s host star.',
  shape: 'Both bodies are treated as perfect spheres of their catalogue radius.',
})

const PROVENANCE_WORDING = {
  measured: 'Based on a measured radius.',
  calculated: 'Based on a radius calculated by NASA from other catalogue values, not a direct measurement.',
  estimated: 'Based on a model-based radius estimate, not a direct measurement.',
  modelBased: 'Based on a radius derived from evolutionary models (directly imaged planet), not a direct measurement.',
}

const RADIUS_FIELD = COMPARE_GROUPS.flatMap((g) => g.fields).find((f) => f.key === 'radiusEarth')

const isPositiveFinite = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0

/**
 * N = (R☉/R)³ for a radius in Earth radii, or null when R is not a positive
 * finite number.
 * @param {number} radiusEarth
 */
export function volumeRatio(radiusEarth) {
  if (!isPositiveFinite(radiusEarth)) return null
  return (SUN_RADIUS_EARTH / radiusEarth) ** 3
}

// ── Display rounding ─────────────────────────────────────────────────────

const pow10 = (e) => Number(`1e${e}`)

/** Round to a multiple of 10^e: 'nearest', 'down' (floor) or 'up' (ceil). */
function roundTo(n, e, mode = 'nearest') {
  const step = pow10(e)
  const k = n / step
  const r = mode === 'down' ? Math.floor(k + 1e-9) : mode === 'up' ? Math.ceil(k - 1e-9) : Math.round(k)
  return Number((r * step).toPrecision(15))
}

/**
 * Count text at a decimal exponent: "1,302,000", "1.302 million",
 * "48.1 million", "927", "0.52". Words are used from a million upwards.
 * @param {number} n
 * @param {number} e   last shown digit is 10^e
 */
export function countText(n, e) {
  for (const [size, word] of [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
  ]) {
    if (Math.abs(n) >= size) {
      const decimals = Math.min(6, Math.max(0, Math.round(Math.log10(size)) - e))
      return `${(n / size).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${word}`
    }
  }
  const decimals = Math.max(0, -e)
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const magnitude = (n) => Math.floor(Math.log10(Math.abs(n)))

// ── Results ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SunfallResult
 * @property {'value'|'lowerBound'|'upperBound'|'unavailable'} status
 *   value: N with uncertainty; lowerBound: N > bound (radius upper limit);
 *   upperBound: N < bound (radius lower limit); unavailable: no number
 * @property {'='|'>'|'<'|null} relation   how the true N relates to `ratio`
 * @property {number|null} ratio            N (or the bound), unrounded
 * @property {[number, number|null]|null} range  N range from the radius uncertainty; high is null when unbounded
 * @property {boolean} uncertaintyKnown
 * @property {{ value: string, low: string|null, high: string|null, exponent: number }|null} display
 * @property {object|null} radius           the radius cell: value, err, limit, kind, status, source, modelBased…
 * @property {'measured'|'calculated'|'estimated'|null} radiusProvenance
 * @property {string|null} reason           why no number is given
 * @property {string[]} notes               provenance and method wording to show with the result
 * @property {{ animate: boolean, target: number|null }} animation
 */

function unavailable(radius, reason) {
  return {
    status: 'unavailable',
    relation: null,
    ratio: null,
    range: null,
    uncertaintyKnown: false,
    display: null,
    radius,
    radiusProvenance: null,
    reason,
    notes: [SUNFALL_WORDING.sun],
    animation: { animate: false, target: null },
    constants: SUNFALL_CONSTANTS,
  }
}

/**
 * Volume equivalence from a radius cell (see compare.js compareCell): the
 * core used by sunfallResult and by tests.
 * @param {ReturnType<typeof compareCell>} cell
 * @returns {SunfallResult}
 */
export function sunfallFromCell(cell) {
  if (!cell || cell.kind === 'missing' || cell.value == null) {
    return unavailable(cell ?? null, cell?.reason ?? 'Not available in the NASA Exoplanet Archive')
  }
  if (!isPositiveFinite(cell.value)) return unavailable(cell, 'The catalogue radius is not a positive number')

  const n = volumeRatio(cell.value)
  const radiusProvenance = cell.modelBased || cell.kind === 'estimated' ? 'estimated' : cell.kind === 'calculated' ? 'calculated' : 'measured'
  const notes = [
    PROVENANCE_WORDING[cell.modelBased ? 'modelBased' : radiusProvenance],
    SUNFALL_WORDING.equivalence,
    SUNFALL_WORDING.packing,
    SUNFALL_WORDING.sun,
  ]

  if (cell.limit === '<' || cell.limit === '>') {
    // R < r ⇒ N > (R☉/r)³ ; R > r ⇒ N < (R☉/r)³. Round the bound so the
    // statement stays true: down for "more than", up for "fewer than".
    const relation = cell.limit === '<' ? '>' : '<'
    const e = magnitude(n) - 1 // 2 significant figures
    const shown = roundTo(n, e, relation === '>' ? 'down' : 'up')
    notes.unshift(
      relation === '>'
        ? 'Only an upper limit on the radius is known, so the Sun’s volume is at least this many planet volumes.'
        : 'Only a lower limit on the radius is known, so the Sun’s volume is at most this many planet volumes.',
    )
    return {
      status: relation === '>' ? 'lowerBound' : 'upperBound',
      relation,
      ratio: n,
      range: null,
      uncertaintyKnown: false,
      display: { value: countText(shown, e), low: null, high: null, exponent: e },
      radius: cell,
      radiusProvenance,
      reason: null,
      notes,
      animation: { animate: true, target: shown },
      constants: SUNFALL_CONSTANTS,
    }
  }

  const iv = interval(cell)
  if (!iv) {
    // No reported uncertainty: 3 significant figures, and say so.
    const e = magnitude(n) - 2
    notes.unshift('No uncertainty is reported for this radius, so the result is shown to 3 significant figures.')
    return {
      status: 'value',
      relation: '=',
      ratio: n,
      range: null,
      uncertaintyKnown: false,
      display: { value: countText(roundTo(n, e), e), low: null, high: null, exponent: e },
      radius: cell,
      radiusProvenance,
      reason: null,
      notes,
      animation: { animate: true, target: n },
      constants: SUNFALL_CONSTANTS,
    }
  }

  // Exact propagation through the cube: larger radius ⇒ fewer volumes.
  const [rLow, rHigh] = iv
  const nLow = volumeRatio(rHigh)
  const nHigh = rLow > 0 ? volumeRatio(rLow) : null
  // Last shown digit: 2 significant figures of the smaller half-width.
  const half = Math.min(n - nLow, nHigh == null ? Infinity : nHigh - n)
  const e = half > 0 && Number.isFinite(half) ? magnitude(half) - 1 : magnitude(n) - 2
  return {
    status: 'value',
    relation: '=',
    ratio: n,
    range: [nLow, nHigh],
    uncertaintyKnown: true,
    display: {
      value: countText(roundTo(n, e), e),
      low: countText(roundTo(nLow, e, 'down'), e),
      high: nHigh == null ? null : countText(roundTo(nHigh, e, 'up'), e),
      exponent: e,
    },
    radius: cell,
    radiusProvenance,
    reason: null,
    notes,
    animation: { animate: true, target: n },
    constants: SUNFALL_CONSTANTS,
  }
}

/**
 * SUNFALL result for a catalogue planet. Uses only the planet's catalogue
 * radius (imputed values read as missing). Never invents a radius.
 * @param {import('../contracts/planet.js').Planet} planet
 * @returns {SunfallResult & { planetId: string, planetName: string }}
 */
export function sunfallResult(planet) {
  const cell = compareCell(planet, RADIUS_FIELD)
  return { planetId: planet.id, planetName: planet.name, ...sunfallFromCell(cell) }
}

/**
 * One-line headline for a result, e.g. "The Sun’s volume equals about
 * 1.302 million times the volume of TRAPPIST-1 e." Null when unavailable.
 * @param {SunfallResult & { planetName: string }} r
 */
export function sunfallHeadline(r) {
  if (!r || r.status === 'unavailable') return null
  const v = r.display.value
  if (r.relation === '>') return `The Sun’s volume is more than ${v} times the volume of ${r.planetName}.`
  if (r.relation === '<') return `The Sun’s volume is less than ${v} times the volume of ${r.planetName}.`
  return `The Sun’s volume equals about ${v} times the volume of ${r.planetName}.`
}
