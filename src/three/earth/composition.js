// Scene composition for the homepage Earth — owner: LEAD. Pure math.
//
// The Sun's real position (subsolar point, from the date) decides which part
// of Earth is lit; the camera framing stays fixed. The globe is turned about
// its axis so the real subsolar point faces a Sun placed for a cinematic
// three-quarter light. Earth radius = 1.

import { Euler, Quaternion, Vector3 } from 'three'
import { globeYawForSun, latLonToVector, subsolarPoint } from './sunPosition.js'

/** Earth's axis in the scene: leaned back a little and tilted, for a classic globe view. */
export const AXIS_TILT = new Euler(0.24, 0, -0.36)
/** Where the light should come from in world space: from the left and a little in front, so the terminator shows. */
export const KEY_LIGHT = new Vector3(-0.86, 0.22, 0.42).normalize()

/**
 * @param {Date} date
 * @returns {{ sunWorld: [number, number, number], sunLocal: [number, number, number], yaw: number, subsolar: { latDeg: number, lonDeg: number } }}
 */
export function sunComposition(date, tilt = AXIS_TILT, key = KEY_LIGHT) {
  const subsolar = subsolarPoint(date)
  const q = new Quaternion().setFromEuler(tilt)
  // Key light expressed in Earth's equatorial frame; keep its azimuth, use the real declination.
  const local = key.clone().applyQuaternion(q.clone().invert())
  const azimuthDeg = (Math.atan2(-local.z, local.x) * 180) / Math.PI
  const sunLocal = latLonToVector(subsolar.latDeg, azimuthDeg)
  const sunWorld = new Vector3(...sunLocal).applyQuaternion(q).normalize()
  return { sunWorld: sunWorld.toArray(), sunLocal, yaw: globeYawForSun(subsolar.lonDeg, azimuthDeg), subsolar }
}

/**
 * Camera distance and Earth position for a viewport aspect ratio: Earth on the
 * right beside the text on wide screens, centred and lower on tall ones.
 * @param {number} aspect  width / height
 * @param {number} fovDeg  vertical field of view
 */
export function framing(aspect, fovDeg) {
  const t = Math.tan(((fovDeg / 2) * Math.PI) / 180)
  if (aspect >= 1.1) {
    const distance = 5.1
    const halfW = distance * t * aspect
    // Right of the text; on very wide screens Earth stays close enough to read as the centrepiece.
    return { distance, earth: [Math.min(halfW * 0.6, 1.9), -0.04, 0], layout: 'wide' }
  }
  // Tall screens: fit Earth plus most of the orbit across the width.
  const distance = Math.max(5.4, 1.3 / (t * aspect)) // orbit (1.18 Earth radii) nearly spans the width
  const halfH = distance * t
  return { distance, earth: [0, -halfH * 0.36, 0], layout: 'tall' }
}
