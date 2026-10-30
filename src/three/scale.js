// Display-scale functions for every 3D scene — owner: LEAD.
//
// Real planetary systems cannot be drawn to scale: orbits span orders of
// magnitude and planets would be sub-pixel. These functions map physical
// values to scene units *for display only*. Any scene using a non-true scale
// must show the matching SCALE_NOTES label (CLAUDE.md §1.7).
//
// All functions take plain numbers and return null for missing input, so
// callers decide (and label) any visual fallback.

export const SCALE_NOTES = Object.freeze({
  system: 'Not to scale: orbital distances compressed, planet sizes enlarged',
  planet: 'Not to scale: size shown for visibility',
  sizeTrue: 'True relative size',
  sizeVisibility: 'Small bodies enlarged for visibility: not true scale',
  time: 'Time compressed: orbits sped up for viewing',
})

const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Planet radius in scene units for system and hero views.
 * Power-law compression keeps Earths and Jupiters both readable while
 * preserving size order. Earth → 0.35, Jupiter (11.2 R⊕) → ~1.17.
 * @param {number|null} radiusEarth
 * @returns {number|null}
 */
export function planetDisplayRadius(radiusEarth, { base = 0.35, exponent = 0.5, min = 0.18, max = 2.2 } = {}) {
  if (!isPositive(radiusEarth)) return null
  return clamp(base * radiusEarth ** exponent, min, max)
}

/**
 * Star radius in scene units for system views. Sun → 1.4.
 * @param {number|null} radiusSun
 * @returns {number|null}
 */
export function starDisplayRadius(radiusSun, { base = 1.4, exponent = 0.4, min = 0.6, max = 4 } = {}) {
  if (!isPositive(radiusSun)) return null
  return clamp(base * radiusSun ** exponent, min, max)
}

/**
 * Lay out display orbit radii for one system on a log scale.
 *
 * Takes physical semi-major axes (AU) that the caller has already resolved
 * and labelled (NASA value or Kepler's third law; see three/system/
 * systemModel.js). Entries without one are placed outside the others with
 * basis 'arbitrary' and must be labelled as such. Orbits are pushed apart so
 * neighbouring planets never overlap. Output radii are display units only;
 * they are never physical distances.
 *
 * @param {{ id: string, aAU?: number|null, displayRadius?: number|null }[]} entries
 * @param {{ starRadius?: number, innerGap?: number, span?: number, minGap?: number }} [opts]
 * @returns {Map<string, { radius: number, basis: 'distance'|'arbitrary' }>}
 */
export function layoutOrbits(entries, { starRadius = 1.4, innerGap = 1.2, span = 9, minGap = 0.6 } = {}) {
  const placed = entries.filter((e) => isPositive(e.aAU)).sort((p, q) => p.aAU - q.aAU)
  const unplaced = entries.filter((e) => !isPositive(e.aAU))

  const inner = starRadius + innerGap
  const aMin = placed.length ? placed[0].aAU : 1
  const decades = placed.length ? Math.log10(placed[placed.length - 1].aAU / aMin) : 0
  const k = decades > 0 ? clamp(span / decades, 2, 12) : 0

  const result = new Map()
  let prev = null
  const place = (e, ideal, basis) => {
    const own = e.displayRadius ?? 0
    const r = prev ? Math.max(ideal, prev.radius + prev.size + own + minGap) : Math.max(ideal, inner + own)
    result.set(e.id, { radius: r, basis })
    prev = { radius: r, size: own }
  }
  for (const e of placed) place(e, inner + k * Math.log10(e.aAU / aMin), 'distance')
  for (const e of unplaced) place(e, 0, 'arbitrary')
  return result
}

/**
 * On-screen seconds per orbit. Square-root compression keeps both 1-day and
 * 10-year orbits watchable while preserving which planet is faster.
 * Earth's year → 40 s.
 * @param {number|null} periodDays
 * @returns {number|null}
 */
export function displayOrbitSeconds(periodDays, { refDays = 365.25, refSeconds = 40, exponent = 0.5, min = 1.5, max = 240 } = {}) {
  if (!isPositive(periodDays)) return null
  return clamp(refSeconds * (periodDays / refDays) ** exponent, min, max)
}

/**
 * Size-comparison scale shared by all bodies in one view.
 * - 'true': linear in radius; the largest body gets maxSceneRadius
 * - 'visibility': same, but bodies are never smaller than minVisibleRadius
 * @param {(number|null)[]} radii   same unit for all (e.g. R⊕)
 * @param {{ mode?: 'true'|'visibility', maxSceneRadius?: number, minVisibleRadius?: number }} [opts]
 */
export function createSizeCompareScale(radii, { mode = 'visibility', maxSceneRadius = 3, minVisibleRadius = 0.12 } = {}) {
  const known = radii.filter(isPositive)
  const factor = known.length ? maxSceneRadius / Math.max(...known) : 1
  const isTrueScale = mode === 'true'
  return {
    isTrueScale,
    note: isTrueScale ? SCALE_NOTES.sizeTrue : SCALE_NOTES.sizeVisibility,
    /** @param {number|null} r */
    toScene(r) {
      if (!isPositive(r)) return null
      const linear = r * factor
      return isTrueScale ? linear : Math.max(linear, minVisibleRadius)
    },
    /** @param {number|null} r  true when visibility mode enlarged this body */
    isEnlarged(r) {
      return !isTrueScale && isPositive(r) && r * factor < minVisibleRadius
    },
  }
}
