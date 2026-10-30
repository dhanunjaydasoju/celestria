// CONTRACT — owner: LEAD. Frozen at hour 2. Changes: update this file and
// CLAUDE.md §5 first, then announce in team chat.
//
// The normalized Planet model. Every component and science function reads
// this shape, never raw NASA columns. server/nasa/normalize.js produces it.

/**
 * How a value was obtained. See CLAUDE.md §1.2.
 * - measured:   reported by a paper/catalog as a measurement
 * - calculated: derived from measured values with a stated formula (NASA or us)
 * - estimated:  model-based (e.g. NASA's mass–radius relation)
 * - imputed:    visual-only placeholder (catalog median etc.). Never shown as data,
 *               never sent to the AI, never used for habitability.
 * - missing:    not available; value is null
 * @typedef {'measured'|'calculated'|'estimated'|'imputed'|'missing'} Provenance
 */
export const PROVENANCE = Object.freeze({
  MEASURED: 'measured',
  CALCULATED: 'calculated',
  ESTIMATED: 'estimated',
  IMPUTED: 'imputed',
  MISSING: 'missing',
})

/**
 * NASA `pl_bmassprov` mapped to a short kind.
 * - 'Mass'  true mass (measured)
 * - 'Msini' minimum mass M·sin(i) (measured, lower limit)
 * - 'M-R'   from NASA's mass–radius relation (estimated)
 * @typedef {'Mass'|'Msini'|'M-R'} MassKind
 */
export const MASS_KIND = Object.freeze({ TRUE: 'Mass', MIN: 'Msini', MR: 'M-R' })

/**
 * @typedef {Object} Source
 * @property {string} label   citation text, e.g. "Agol et al. 2021" or "Calculated Value"
 * @property {string|null} url
 */

/**
 * A single physical quantity with its provenance.
 * @typedef {Object} Quantity
 * @property {number|null} value       null exactly when status === 'missing'
 * @property {[number, number]} [err]  [+upper, -lower] uncertainty, same unit as value
 * @property {Provenance} status
 * @property {Source} [source]
 * @property {MassKind} [kind]         massEarth only
 * @property {'<'|'>'} [limit]         set when NASA reports only an upper/lower limit
 */

/**
 * @typedef {Object} Star
 * @property {string} name
 * @property {string|null} spectralType
 * @property {Quantity} teff        K
 * @property {Quantity} radiusSun   R☉
 * @property {Quantity} massSun     M☉
 * @property {Quantity} lumLog      log10(L/L☉)
 * @property {Quantity} metallicity [Fe/H] dex
 * @property {Quantity} ageGyr      Gyr
 */

/**
 * @typedef {Object} Planet
 * @property {string} id                 URL slug of name, e.g. "trappist-1-e"
 * @property {string} name               NASA pl_name
 * @property {string} host               NASA hostname
 * @property {Quantity} radiusEarth      R⊕   (pl_rade)
 * @property {Quantity} massEarth        M⊕   (pl_bmasse, with kind)
 * @property {Quantity} densityGcc       g/cm³ (pl_dens)
 * @property {Quantity} eqTempK          K    (pl_eqt)
 * @property {Quantity} insolationEarth  S⊕   (pl_insol)
 * @property {Quantity} periodDays       days (pl_orbper)
 * @property {Quantity} semiMajorAxisAU  AU   (pl_orbsmax)
 * @property {Quantity} eccentricity     —    (pl_orbeccen)
 * @property {Quantity} inclinationDeg   deg  (pl_orbincl)
 * @property {Quantity} periastronArgDeg deg  (pl_orblper, ω)
 * @property {Quantity} periastronTimeJD BJD  (pl_orbtper)
 * @property {Quantity} transitMidJD     BJD  (pl_tranmid)
 * @property {Star} star
 * @property {{ year: number|null, method: string|null, facility: string|null, telescope: string|null }} discovery
 * @property {{ distancePc: Quantity, planetCount: number|null, starCount: number|null, raDeg: number|null, decDeg: number|null, vMag: number|null }} system
 * @property {{ controversial: boolean, ttv: boolean }} flags
 */

/** @param {Quantity|null|undefined} q */
export function isKnown(q) {
  return q != null && q.value != null && q.status !== PROVENANCE.MISSING
}

/**
 * True when a value may be used as scientific evidence (tables, AI prompts,
 * habitability). Imputed values are visual-only and never qualify.
 * @param {Quantity|null|undefined} q
 */
export function isScientific(q) {
  return isKnown(q) && q.status !== PROVENANCE.IMPUTED
}

/**
 * Numeric value for science code, or null. Imputed values return null.
 * @param {Quantity|null|undefined} q
 * @returns {number|null}
 */
export function scienceValue(q) {
  return isScientific(q) ? q.value : null
}

/** @returns {Quantity} */
export function missing() {
  return { value: null, status: PROVENANCE.MISSING }
}

/**
 * @param {number|null} value
 * @param {Provenance} status
 * @param {Partial<Quantity>} [extra]
 * @returns {Quantity}
 */
export function quantity(value, status, extra = {}) {
  if (value == null || !Number.isFinite(value)) return missing()
  return { value, status, ...extra }
}

/** "TRAPPIST-1 e" → "trappist-1-e" */
export function planetSlug(name) {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
