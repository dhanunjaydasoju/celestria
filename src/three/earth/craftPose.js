// Spacecraft pose on the homepage orbit — owner: LEAD. Pure (three.js math only).

import { Matrix4, Quaternion, Vector3 } from 'three'
import { AXIS_TILT } from './composition.js'
import { attitude, orbitState } from './orbit.js'

export const RAAN_DEG = -10 // orbit orientation chosen for the composition (front pass crosses Earth's left limb)

const v3 = (a) => new Vector3(...a)

/** Start / still pose: just off Earth's left limb at mid height, on the near side. */
const START_TARGET = new Vector3(-0.98, 0.12, 0.62)

export function frontPhase(tilt = AXIS_TILT) {
  let best = 0
  let bestScore = -Infinity
  for (let k = 0; k < 360; k++) {
    const a = (k * Math.PI) / 180
    const p = v3(orbitState(0, { raanDeg: RAAN_DEG, phase: a }).position).applyEuler(tilt)
    const score = -p.distanceTo(START_TARGET)
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  return best
}
export const PHASE0 = frontPhase()

/**
 * Position (Earth's equatorial frame) and orientation of the craft at t
 * seconds: nose along the velocity, arrays turned towards the Sun.
 * Craft axes: +X along the arrays, +Y array face normal, +Z nose.
 */
export function craftPose(t, sunLocal) {
  const s = orbitState(t, { raanDeg: RAAN_DEG, phase: PHASE0 })
  const { forward, panelNormal, span } = attitude(s.velocity, sunLocal)
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(v3(span), v3(panelNormal), v3(forward)))
  return { position: s.position, quaternion, forward, panelNormal }
}
