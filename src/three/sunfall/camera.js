// SUNFALL scene framing — owner: LEAD (Stage S3). Pure.

export const SUN_SCENE_RADIUS = 10
export const CAMERA_Z = 40
const CAMERA_END_Z = 33
export const FOV = 40

export const SUNFALL_CAMERA = Object.freeze({ position: [0, 1.5, CAMERA_Z], fov: FOV, near: 0.1, far: 4000 })

/** Fraction of the Sun's radius kept inside the frame's width on narrow screens. */
const WIDTH_FIT = 1.18

/**
 * How much farther the camera sits on narrow (portrait) screens, so the
 * Sun's disc still fits the frame's width. 1 on landscape screens.
 * @param {number} aspect  width / height
 */
export function distanceScale(aspect) {
  if (!(aspect > 0)) return 1
  const halfH = Math.tan(((FOV / 2) * Math.PI) / 180)
  const needed = (SUN_SCENE_RADIUS * WIDTH_FIT) / (halfH * aspect)
  return Math.max(1, needed / CAMERA_END_Z)
}

/**
 * Camera position at time t: a slow, eased push-in with a slight sideways
 * drift. Derived from t, so pause, replay and skip need no extra state.
 * @param {number} t
 * @param {number} total
 * @param {number} [aspect=16/9]
 */
export function cameraPose(t, total, aspect = 16 / 9) {
  const p = Math.min(1, Math.max(0, total > 0 ? t / total : 1))
  const e = p * p * (3 - 2 * p)
  const k = distanceScale(aspect)
  return [Math.sin(p * 1.2) * 2.2, 1.5 - e * 0.6, (CAMERA_Z + (CAMERA_END_Z - CAMERA_Z) * e) * k]
}
