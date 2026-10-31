// Spacecraft orbit for the homepage scene — owner: LEAD. Pure math.
//
// A circular orbit inclined 51.6° to Earth's equator (the ISS/Soyuz orbital
// inclination). Radius and period are NOT to scale: the real orbit is ~400 km
// up (1.06 Earth radii) with a 92-minute period; here it is raised and sped up
// so a visible-size craft reads clearly. Units: Earth radius = 1.

export const INCLINATION_DEG = 51.6
export const ORBIT_RADIUS = 1.18 //   Earth radii (real ≈ 1.063); keeps the whole path in frame
export const ORBIT_PERIOD_S = 72 //   seconds per orbit (real ≈ 5,520 s)
export const REAL = { altitudeKm: 400, periodMin: 92 }

const DEG = Math.PI / 180

/**
 * Position and velocity direction in Earth's equatorial frame (Y = north pole).
 * @param {number} tSeconds
 * @param {{ radius?: number, period?: number, inclinationDeg?: number, raanDeg?: number, phase?: number }} [o]
 * @returns {{ position: [number, number, number], velocity: [number, number, number], angle: number }}
 */
export function orbitState(tSeconds, { radius = ORBIT_RADIUS, period = ORBIT_PERIOD_S, inclinationDeg = INCLINATION_DEG, raanDeg = 0, phase = 0 } = {}) {
  const angle = phase + (2 * Math.PI * tSeconds) / period
  const i = inclinationDeg * DEG
  const raan = raanDeg * DEG
  // In-plane (ascending node on +X), then tilt by i about X, then rotate the node by RAAN about Y.
  const px = Math.cos(angle)
  const pz = -Math.sin(angle)
  const vx = -Math.sin(angle)
  const vz = -Math.cos(angle)
  const tilt = (x, z) => [x, -z * Math.sin(i), z * Math.cos(i)]
  const rot = ([x, y, z]) => [x * Math.cos(raan) + z * Math.sin(raan), y, -x * Math.sin(raan) + z * Math.cos(raan)]
  const p = rot(tilt(px, pz))
  const v = rot(tilt(vx, vz))
  return { position: p.map((c) => c * radius), velocity: v, angle }
}

/** Closed polyline of the orbit (for drawing the path). */
export function orbitPath(segments = 256, opts = {}) {
  const pts = []
  for (let k = 0; k <= segments; k++) pts.push(orbitState((k / segments) * (opts.period ?? ORBIT_PERIOD_S), { ...opts, phase: 0 }).position)
  return pts
}

/**
 * Spacecraft attitude: nose along the velocity, solar-array faces turned
 * towards the Sun as far as a roll about the long axis allows.
 * @returns {{ forward: number[], panelNormal: number[], span: number[] }} orthonormal basis
 */
export function attitude(velocity, sunDir) {
  const f = norm(velocity)
  let n = sub(sunDir, scale(f, dot(sunDir, f))) // Sun direction with the along-track part removed
  if (len(n) < 1e-3) n = sub([0, 1, 0], scale(f, f[1])) // Sun along the track: any perpendicular
  n = norm(n)
  const span = norm(cross(n, f))
  return { forward: f, panelNormal: n, span }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a, s) => a.map((c) => c * s)
const sub = (a, b) => a.map((c, k) => c - b[k])
const len = (a) => Math.hypot(...a)
const norm = (a) => scale(a, 1 / (len(a) || 1))
