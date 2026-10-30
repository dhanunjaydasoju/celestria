// Camera framing — owner: LEAD.
//
// A perspective camera's vertical FOV is fixed, so on tall/narrow viewports
// the horizontal FOV shrinks and objects framed by height get cropped at the
// sides. These functions fit a bounding sphere inside *both* FOVs.

const DEG = Math.PI / 180

/**
 * Horizontal field of view (degrees) for a vertical FOV and aspect (w/h).
 * @param {number} fovYDeg
 * @param {number} aspect
 */
export function horizontalFov(fovYDeg, aspect) {
  return (2 * Math.atan(Math.tan((fovYDeg * DEG) / 2) * aspect)) / DEG
}

/**
 * Camera distance from a sphere's centre at which the whole sphere fits the
 * view, with `margin` (> 1) leaving breathing room around it.
 * @param {number} radius   bounding-sphere radius, scene units
 * @param {number} fovYDeg  vertical field of view
 * @param {number} aspect   viewport width / height
 * @param {number} [margin=1.15]
 */
export function fitDistance(radius, fovYDeg, aspect, margin = 1.15) {
  if (!(radius > 0) || !(aspect > 0)) return null
  const halfY = (fovYDeg * DEG) / 2
  const halfX = Math.atan(Math.tan(halfY) * aspect)
  return (radius * margin) / Math.sin(Math.min(halfX, halfY))
}
