// SUNFALL swarm plan and counter — owner: LEAD (Stage S3). Pure.
//
// Turns an S1 result (src/science/sunfall.js) into what the animation draws:
// how many copies, what each copy stands for, how big each copy is drawn and
// what the counter shows at any moment. The counter is always a fraction of
// the S1 volume-equivalent value, never a count of rendered copies.

import { SUN_RADIUS_EARTH, countText } from '../../science/sunfall.js'

/** Copies drawn at most, per quality tier. */
export const MAX_COPIES = Object.freeze({ high: 1200, low: 300 })

/** Smallest copy radius drawn, as a fraction of the Sun's radius (≈ 0.68 R⊕). */
export const MIN_COPY_FRACTION = 1 / 160

/** Seconds of flight before the first arrival, then seconds over which arrivals happen. */
export const SWARM_LEAD = 3.5
export const SWARM_DURATION = 14

/**
 * Copy size in scene units. True relative size (R / R☉ of the Sun's scene
 * radius) unless that is below the visibility floor; then enlarged, with the
 * factor reported so the UI can say so.
 * @param {number} radiusEarth
 * @param {number} sunSceneRadius
 */
export function copyScale(radiusEarth, sunSceneRadius) {
  const trueSize = (radiusEarth / SUN_RADIUS_EARTH) * sunSceneRadius
  const floor = MIN_COPY_FRACTION * sunSceneRadius
  if (trueSize >= floor) return { scene: trueSize, enlarged: false, factor: 1 }
  return { scene: floor, enlarged: true, factor: floor / trueSize }
}

/**
 * What the swarm shows for an S1 result, or { animate: false } when there is
 * no usable number (missing, imputed or invalid radius).
 * @param {import('../../science/sunfall.js').SunfallResult} result
 * @param {{ tier: 'high'|'low', sunSceneRadius: number }} opts
 */
export function planSwarm(result, { tier, sunSceneRadius }) {
  if (!result || result.status === 'unavailable' || !result.animation?.animate) {
    return { animate: false, reason: result?.reason ?? 'No usable radius' }
  }
  const target = result.animation.target
  const cap = MAX_COPIES[tier] ?? MAX_COPIES.low
  const whole = Math.max(1, Math.round(target))
  const oneToOne = result.status === 'value' && whole <= cap
  const copies = oneToOne ? whole : cap
  return {
    animate: true,
    target, //                 counter end value (S1), not the copy count
    relation: result.relation,
    copies,
    oneToOne,
    perCopy: target / copies, // planet volumes each drawn copy stands for
    size: copyScale(result.radius.value, sunSceneRadius),
    lead: SWARM_LEAD,
    duration: SWARM_DURATION,
    total: SWARM_LEAD + SWARM_DURATION,
  }
}

// ── Timing ───────────────────────────────────────────────────────────────

/** Share of the volume equivalent counted by progress u ∈ [0, 1]: smoothstep (slow, fast, slow). */
export function arrivalFraction(u) {
  const x = Math.min(1, Math.max(0, u))
  return x * x * (3 - 2 * x)
}

/** Inverse of arrivalFraction: progress at which a fraction y has arrived. */
export function arrivalProgress(y) {
  const v = Math.min(1, Math.max(0, y))
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3)
}

/** Counting progress 0..1 at time t (seconds since play started): 0 until the first arrival. */
export const progressAt = (t, { lead = SWARM_LEAD, duration = SWARM_DURATION } = {}) => Math.min(1, Math.max(0, (t - lead) / duration))

// ── Counter ──────────────────────────────────────────────────────────────

/**
 * Counter text at a given progress. While running: the S1 value × the share
 * arrived, as a whole number. At the end: the S1 display value with its
 * relation (≈, more than, fewer than), exactly as S1 rounded it.
 * @param {import('../../science/sunfall.js').SunfallResult} result
 * @param {number} progress  0..1
 */
export function counterText(result, progress) {
  if (!result || result.status === 'unavailable') return null
  if (progress >= 1) {
    const prefix = result.relation === '>' ? 'More than ' : result.relation === '<' ? 'Fewer than ' : '≈ '
    return { value: `${prefix}${result.display.value}`, final: true }
  }
  const n = Math.floor(result.animation.target * arrivalFraction(progress))
  return { value: n >= 1e6 ? countText(n, Math.max(0, Math.floor(Math.log10(n)) - 3)) : n.toLocaleString('en-US'), final: false }
}

/**
 * "Each copy shown stands for about 1,390 planet volumes" (or "at least" /
 * "at most" for a bound), or null when every copy is one planet volume.
 */
export function perCopyText(plan) {
  if (!plan?.animate || plan.oneToOne) return null
  const e = Math.max(0, Math.floor(Math.log10(plan.perCopy)) - 2) // 3 significant figures
  const mode = plan.relation === '>' ? Math.floor : plan.relation === '<' ? Math.ceil : Math.round
  const word = plan.relation === '>' ? 'at least' : plan.relation === '<' ? 'at most' : 'about'
  return `Each copy shown stands for ${word} ${countText(mode(plan.perCopy / 10 ** e) * 10 ** e, e)} planet volumes`
}
