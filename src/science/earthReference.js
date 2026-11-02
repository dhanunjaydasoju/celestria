// Earth and Sun reference values for comparisons — owner: LEAD (Stage 2a).
//
// These are REFERENCE values, not catalogue data. They carry
// status: 'reference' (deliberately not one of the Planet model's provenance
// statuses) so they can never pass as a NASA measurement, are never ranked
// against catalogue planets and are never sent to the AI.
//
// Values are taken from their own sources, independently of the constants in
// the AI astronomer's compare_planets tool, and are checked against:
// - NASA NSSDCA Earth Fact Sheet (D. R. Williams, last updated 15 Nov 2024)
// - NASA NSSDCA Sun Fact Sheet (D. R. Williams, last updated 9 May 2024)
// - IAU 2015 Resolution B3, nominal solar and planetary conversion constants
//   (Mamajek et al. 2015, arXiv:1510.07674)
// - Bouvier & Wadhwa 2010, Nature Geoscience 3, 637–641 (age of the Solar System)
//
// Keys match the comparison field keys in compare.js. Planet keys are Earth's
// values, `star.*` keys are the Sun's. Fields with no meaningful Earth
// counterpart (e.g. sky-plane inclination, distance from Earth) are absent.

const NASA_EARTH = { label: 'NASA NSSDCA Earth Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html' }
const NASA_SUN = { label: 'NASA NSSDCA Sun Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html' }
const IAU_2015 = { label: 'IAU 2015 Resolution B3 (Mamajek et al. 2015)', url: 'https://arxiv.org/abs/1510.07674' }
const BOUVIER_2010 = { label: 'Bouvier & Wadhwa 2010, Nature Geoscience 3, 637', url: 'https://doi.org/10.1038/ngeo941' }
const DEFINITION = { label: 'Definition of the unit', url: null }

export const REFERENCE_STATUS = 'reference'

/**
 * @typedef {Object} ReferenceValue
 * @property {number} value
 * @property {'reference'} status
 * @property {string} unit
 * @property {string} basis              how the value is defined or obtained
 * @property {{ label: string, url: string|null }} source
 */

/** @returns {ReferenceValue} */
const ref = (value, unit, basis, source) => Object.freeze({ value, status: REFERENCE_STATUS, unit, basis, source })

/** Earth volumetric mean radius, km (NASA NSSDCA Earth Fact Sheet). Defines 1 R⊕ here. */
export const EARTH_RADIUS_KM = 6371.0
/** Nominal solar radius, km (IAU 2015 Resolution B3). Defines 1 R☉ here. */
export const SUN_RADIUS_KM = 695700

// Earth's sidereal orbit: a = 149.598 × 10⁶ km = 1.0000 AU, e = 0.0167 (NASA).
const EARTH_A_AU = 1
const EARTH_E = 0.0167

/** Earth (planet fields) and the Sun (`star.*` fields). */
export const EARTH_REFERENCE = Object.freeze({
  name: 'Earth',
  host: 'Sun',
  values: Object.freeze({
    radiusEarth: ref(1, 'R⊕', '1 R⊕ by definition; Earth volumetric mean radius 6,371.000 km', NASA_EARTH),
    massEarth: ref(1, 'M⊕', '1 M⊕ by definition; Earth mass 5.9722 × 10²⁴ kg', NASA_EARTH),
    densityGcc: ref(5.513, 'g/cm³', 'Earth mean density 5,513 kg/m³', NASA_EARTH),
    // Matches how surfaceGravity() reports planets: g = (M/R²) × g₀, so Earth is
    // exactly g₀. NASA lists Earth's mean surface gravity as 9.820 m/s².
    surfaceGravity: ref(9.80665, 'm/s²', 'Standard gravity g₀ (the scale used for planet gravity); NASA mean surface gravity 9.820 m/s²', NASA_EARTH),
    eqTempK: ref(254.0, 'K', 'Black-body temperature with Bond albedo 0.294 and no greenhouse effect (average surface temperature is 288 K)', NASA_EARTH),
    insolationEarth: ref(1, 'S⊕', '1 S⊕ by definition; solar irradiance at Earth 1,361.0 W/m²', NASA_EARTH),
    periodDays: ref(365.256, 'days', 'Sidereal orbit period', NASA_EARTH),
    semiMajorAxisAU: ref(EARTH_A_AU, 'AU', 'Semi-major axis 149.598 × 10⁶ km', NASA_EARTH),
    eccentricity: ref(EARTH_E, '', 'Orbit eccentricity', NASA_EARTH),
    periastron: ref(Number((EARTH_A_AU * (1 - EARTH_E)).toFixed(4)), 'AU', 'a(1 − e) from the reference semi-major axis and eccentricity', NASA_EARTH),
    apoastron: ref(Number((EARTH_A_AU * (1 + EARTH_E)).toFixed(4)), 'AU', 'a(1 + e) from the reference semi-major axis and eccentricity', NASA_EARTH),
    'star.teff': ref(5772, 'K', 'Nominal solar effective temperature', IAU_2015),
    'star.massSun': ref(1, 'M☉', '1 M☉ by definition; solar mass 1.9884 × 10³⁰ kg', NASA_SUN),
    'star.radiusSun': ref(1, 'R☉', '1 R☉ by definition; nominal solar radius 695,700 km', IAU_2015),
    'star.lumLog': ref(0, 'log L/L☉', 'log₁₀(L/L☉) = 0 by definition; nominal solar luminosity 3.828 × 10²⁶ W', IAU_2015),
    'star.metallicity': ref(0, '[Fe/H] dex', '[Fe/H] is measured relative to the Sun, so the Sun is 0 by definition', DEFINITION),
    'star.ageGyr': ref(4.57, 'Gyr', 'Age of the Solar System from the oldest meteoritic inclusions (4,568 Myr)', BOUVIER_2010),
  }),
  facts: Object.freeze({
    'star.name': 'Sun',
    'star.spectralType': 'G2 V',
    'system.planetCount': 8,
    'system.starCount': 1,
  }),
})

/**
 * Reference value for a comparison field, or null when Earth/Sun has no
 * meaningful counterpart.
 * @param {string} key
 * @returns {ReferenceValue|null}
 */
export function earthReferenceValue(key) {
  return EARTH_REFERENCE.values[key] ?? null
}
