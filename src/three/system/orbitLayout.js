// Orbital Simulator scene layout — owner: LEAD (M3). Shared by OrbitScene and
// the OrbitViewport overlays so labels and notes match what is drawn.

import { orbitExtremes } from '../../science/kepler.js'

/** Orbital-plane (x, y) → scene (x, 0, −y); the orbit lies in the XZ plane. */
export const toScene = (x, y, s) => [x * s, 0, -y * s]

/**
 * Layout of the scene in scene units, shared with the viewport overlays.
 * @param {ReturnType<typeof import('../../science/kepler.js').orbitalElements>} el
 */
export function orbitLayout(el) {
  const ext = orbitExtremes(el)
  const scale = 10 / ext.apoastronAU
  const q = ext.periastronAU * scale
  const trueStar = el.starRadiusAU != null ? el.starRadiusAU * scale : null
  const minStar = Math.min(0.42, q * 0.4)
  const starEnlarged = trueStar == null || trueStar < minStar
  const starRadius = starEnlarged ? minStar : Math.min(trueStar, q * 0.8)
  const planetRadius = Math.min(0.34, Math.max(0.1, (q - starRadius) * 0.45))
  const centerOffset = -el.a * el.e * scale // ellipse centre, along the periastron direction
  const center = toScene(Math.cos(el.omega) * centerOffset / scale, Math.sin(el.omega) * centerOffset / scale, scale)
  return {
    scale,
    starRadius,
    starEnlarged,
    starTrueScale: !starEnlarged,
    starEnlargement: trueStar ? starRadius / trueStar : null,
    planetRadius,
    center,
    frameRadius: el.a * scale * Math.max(1, Math.sqrt(1 - el.e * el.e)) + planetRadius * 2,
  }
}

