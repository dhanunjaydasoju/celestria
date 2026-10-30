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

// ── LEAD: src/science/kepler.js (M3, implemented) ──────────────────────────
// orbitalElements(planet) → elements | null (null when no period). Fields:
//   P, periodErr, a, aSource ('catalog'|'kepler'|'normalised'), e,
//   eStatus ('measured'|'assumed'|'missing'), omega (rad), omegaStatus,
//   inclinationDeg, starMassSun, gm, starRadiusAU, transits,
//   anchor { kind: 'transit'|'periastron'|'none', tp, epoch, epochErr,
//            approximate, consistency }, assumptions [{ key, text }]
// orbitState(el, t) → { meanAnomaly, phase, eccentricAnomaly, trueAnomaly,
//   rAU, x, y, vDir, speedKmS|null }
// orbitExtremes(el), transitPhase(el), timingUncertainty(el, t),
// realDateReliability(el, t) → { ok, reason, uncertainty }
// See kepler.js for formulas and conventions.

// ── LEAD: src/science/travel.js ─────────────────────────────────────────────
/** @typedef {(distancePc: number|null) => { label: string, speedKmS: number, years: number }[]|null} TravelTimes */

export {}
