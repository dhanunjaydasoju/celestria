// Subsolar point (where the Sun is overhead) for a given time — owner: LEAD.
//
// Low-precision solar coordinates from the Astronomical Almanac (accurate to
// ~0.01°, ample for lighting a globe):
//   n  = JD − 2451545.0
//   L  = 280.460° + 0.9856474°·n           mean longitude
//   g  = 357.528° + 0.9856003°·n           mean anomaly
//   λ  = L + 1.915°·sin g + 0.020°·sin 2g  ecliptic longitude
//   ε  = 23.439° − 0.0000004°·n            obliquity
//   δ  = asin(sin ε · sin λ)               declination  → subsolar latitude
//   α  = atan2(cos ε · sin λ, cos λ)       right ascension
//   GMST = 280.46061837° + 360.98564736629°·n
//   subsolar longitude = α − GMST

const DEG = Math.PI / 180
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180

/** Julian Date from a JS Date (UTC). */
export const julianDate = (date) => date.getTime() / 86400000 + 2440587.5

/**
 * @param {Date} date
 * @returns {{ latDeg: number, lonDeg: number }} subsolar point
 */
export function subsolarPoint(date) {
  const n = julianDate(date) - 2451545.0
  const L = 280.46 + 0.9856474 * n
  const g = (357.528 + 0.9856003 * n) * DEG
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG
  const eps = (23.439 - 0.0000004 * n) * DEG
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const gmst = 280.46061837 + 360.98564736629 * n
  return { latDeg: dec / DEG, lonDeg: wrap180(ra / DEG - gmst) }
}

/**
 * Unit vector for a latitude/longitude in the globe's object space, matching
 * THREE.SphereGeometry's equirectangular UVs: longitude 0 faces +X, +90° E
 * faces −Z, the north pole is +Y.
 */
export function latLonToVector(latDeg, lonDeg) {
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)]
}

/**
 * Rotation of the globe about its axis (radians) that turns the subsolar
 * point towards a chosen Sun azimuth in the scene. Rotating about +Y by θ
 * adds θ to every longitude in this convention, so θ = azimuth − subsolar lon.
 */
export const globeYawForSun = (subsolarLonDeg, sunAzimuthDeg) => (sunAzimuthDeg - subsolarLonDeg) * DEG
