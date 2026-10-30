// Approximate blackbody colour of a star — owner: LEAD.
//
// Fit of Planck-spectrum sRGB values (Tanner Helland's approximation, valid
// ~1000–40000 K). Display colour only: real stellar spectra differ from
// blackbodies and perceived colour depends on exposure.

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/**
 * @param {number|null} teffK
 * @returns {[number, number, number]|null}  sRGB components in 0–1
 */
export function blackbodyRGB(teffK) {
  if (teffK == null || !Number.isFinite(teffK) || teffK <= 0) return null
  const t = Math.min(40000, Math.max(1000, teffK)) / 100

  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307

  return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)]
}

/** Neutral light for stars with no temperature (visual fallback, labelled). */
export const NEUTRAL_STAR_RGB = Object.freeze([1, 0.96, 0.9])

/**
 * Light colour for illuminating planets: the blackbody hue, softened toward
 * white so surfaces stay readable under very red M-dwarf light.
 * @param {number|null} teffK
 * @returns {{ rgb: [number, number, number], imputed: boolean }}
 */
export function starLightRGB(teffK, softness = 0.35) {
  const bb = blackbodyRGB(teffK)
  if (!bb) return { rgb: [...NEUTRAL_STAR_RGB], imputed: true }
  return { rgb: bb.map((c) => c + (1 - c) * softness), imputed: false }
}
