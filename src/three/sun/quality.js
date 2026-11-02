// SUNFALL Sun quality tiers and palette — owner: LEAD (Stage S2). Pure.
//
// Tiers follow the homepage's device detection (earth/quality.js): 'low' for
// phones, small screens, weak or data-saving devices, and for any device
// whose frame rate drops at run time. The Sun can fill most of the screen,
// so the low tier mainly cuts fragment cost: pixel ratio and noise octaves.

import { detectTier } from '../earth/quality.js'

export { detectTier }

export const SUN_TIERS = Object.freeze({
  high: Object.freeze({ dpr: [1, 1.5], segments: 128, octaves: 5, granuleScale: 72, prominences: true, stars: 5000 }),
  low: Object.freeze({ dpr: [1, 1.25], segments: 64, octaves: 3, granuleScale: 52, prominences: true, stars: 2500 }),
})

/** @param {'high'|'low'|string} key  unknown keys fall back to 'low' */
export function sunTier(key) {
  return SUN_TIERS[key] ?? SUN_TIERS.low
}

/**
 * Stylised photosphere palette (sRGB hex). The Sun's true colour is close to
 * white (blackbody ~5,772 K); these orange-yellow tones follow the familiar
 * filtered solar imagery and are labelled as artistic on screen.
 */
export const SUN_PALETTE = Object.freeze({
  deep: '#9c2304',
  mid: '#e8650a',
  hot: '#ff9a1a',
  core: '#ffd27a',
  chromosphere: '#ff6a2a',
  prominence: '#ff5a1f',
  corona: [1, 0.66, 0.36],
})

/** Layer sizes relative to the photosphere radius. */
export const SUN_LAYERS = Object.freeze({
  chromosphere: 1.025, // shell scale
  prominence: 1.36, //    half-size of the prominence disc
  coronaInner: 2.6, //    half-size of the inner corona disc
  coronaOuter: 7.5, //    half-size of the wide halo
})

/**
 * |dot(N, V)| on a shell of `shellScale` at the inner sphere's limb, seen from
 * far away: sqrt(1 − 1/s²). Used by the chromosphere rim shader.
 * @param {number} shellScale  > 1
 */
export function limbDot(shellScale) {
  if (!(shellScale > 1)) return 0
  return Math.sqrt(1 - 1 / (shellScale * shellScale))
}
