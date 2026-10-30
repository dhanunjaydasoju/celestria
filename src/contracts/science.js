// CONTRACT — owner: LEAD. Signatures of the pure science functions in
// src/science/. Implementations belong to the owner tagged on each function.
// All functions return null (never NaN or 0) when required inputs are missing,
// and read inputs through scienceValue() so imputed values are ignored.

/** @typedef {import('./planet.js').Planet} Planet */
/** @typedef {import('./planet.js').Quantity} Quantity */

// ── AI: src/science/habitability.js ─────────────────────────────────────────
/**
 * @typedef {'favorable'|'uncertain'|'unfavorable'|'unknown'} FactorStatus
 *
 * @typedef {Object} HabitabilityFactor
 * @property {string} key            'flux' | 'size' | 'mass' | 'gravity' | 'eqTemp' | 'star' | 'atmosphere'
 * @property {string} label
 * @property {FactorStatus} status
 * @property {{ label: string, quantity: Quantity, unit: string }[]} inputs
 * @property {string} explanation    one line, plain language
 *
 * @typedef {Object} HabitabilityAssessment
 * @property {{ key: string, label: string }} tier   qualitative only — never a percentage
 * @property {HabitabilityFactor[]} factors
 * @property {string[]} notes        always includes the "HZ ≠ habitable" caveat
 */
/** @typedef {(planet: Planet) => HabitabilityAssessment} AssessHabitability */

// ── AI: src/science/habitableZone.js (Kopparapu et al. 2013/2014) ───────────
/**
 * @typedef {{ conservative: [number, number], optimistic: [number, number] }} HabitableZoneAU
 * @typedef {(teffK: number|null, lumLog: number|null) => HabitableZoneAU|null} HabitableZone
 */

// ── AI: src/science/funFacts.js ─────────────────────────────────────────────
/**
 * @typedef {Object} FunFact
 * @property {string} id
 * @property {string} text
 * @property {string[]} fields       Planet fields the fact uses, e.g. ['periodDays']
 * @property {'measured'|'calculated'|'estimated'} basis   weakest provenance among inputs
 */
/** @typedef {(planet: Planet, stats: CatalogStats) => FunFact[]} GetFunFacts */

// ── DATA: src/science/catalogStats.js ───────────────────────────────────────
/**
 * Medians are for visual imputation only (status 'imputed').
 * @typedef {Object} CatalogStats
 * @property {Record<string, number>} medians          keyed by Planet field name
 * @property {(field: string, value: number) => number|null} percentile   0–100
 */
/** @typedef {(planets: Planet[]) => CatalogStats} ComputeCatalogStats */

// ── LEAD: src/science/kepler.js ─────────────────────────────────────────────
/**
 * @typedef {Object} OrbitalElements
 * @property {number} P            period, days
 * @property {number|null} a       semi-major axis, AU (null → normalized orbit only)
 * @property {number} e            eccentricity (0 when assumed)
 * @property {number|null} i       inclination, deg
 * @property {number} omega        argument of periastron, deg (90 when assumed)
 * @property {number} tp           time of periastron, BJD (0 when unanchored)
 * @property {number|null} starMassSun
 * @property {string[]} assumptions  human-readable, shown as banners
 * @property {boolean} anchored      true when phase is tied to real time
 *
 * @typedef {Object} OrbitState
 * @property {number} x            orbital-plane coords, AU (or units of a when normalized)
 * @property {number} y
 * @property {number} z
 * @property {number} rAU          distance from star
 * @property {number|null} speedKmS  null when a or star mass unknown
 * @property {number} trueAnomaly  rad
 * @property {number} phase        0–1, mean-anomaly fraction since periastron
 */
/** @typedef {(planet: Planet) => OrbitalElements|null} GetOrbitalElements */
/** @typedef {(el: OrbitalElements, tDays: number) => OrbitState} GetOrbitState */

// ── LEAD: src/science/travel.js ─────────────────────────────────────────────
/** @typedef {(distancePc: number|null) => { label: string, speedKmS: number, years: number }[]|null} TravelTimes */

export {}
