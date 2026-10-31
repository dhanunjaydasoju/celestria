// NASA Exoplanet Archive (pscomppars) columns and their mapping to the Planet
// model — owner: DATA (implemented by LEAD in M4). Shared by the server
// ingestion and the tests. Mirrors scripts/build-lab-fixtures.js, plus
// transit-midpoint uncertainties (pl_tranmiderr1/2).

export const TAP_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
export const TABLE = 'pscomppars'

/** Planet field → NASA column. Each also fetches _reflink, err1, err2, lim. */
export const PLANET_FIELDS = {
  radiusEarth: 'pl_rade',
  massEarth: 'pl_bmasse',
  densityGcc: 'pl_dens',
  eqTempK: 'pl_eqt',
  insolationEarth: 'pl_insol',
  periodDays: 'pl_orbper',
  semiMajorAxisAU: 'pl_orbsmax',
  eccentricity: 'pl_orbeccen',
  inclinationDeg: 'pl_orbincl',
  periastronArgDeg: 'pl_orblper',
  periastronTimeJD: 'pl_orbtper',
  transitMidJD: 'pl_tranmid',
}

export const STAR_FIELDS = {
  teff: 'st_teff',
  radiusSun: 'st_rad',
  massSun: 'st_mass',
  lumLog: 'st_lum',
  metallicity: 'st_met',
  ageGyr: 'st_age',
}

export const SYSTEM_QUANTITIES = { distancePc: 'sy_dist' }

export const IDENTITY_COLUMNS = [
  'pl_name', 'hostname', 'sy_snum', 'sy_pnum', 'pl_controv_flag', 'ttv_flag',
  'discoverymethod', 'disc_year', 'disc_facility', 'disc_telescope',
  'pl_bmassprov', 'st_spectype', 'ra', 'dec', 'sy_vmag',
]

// NASA names some limit flags irregularly (pl_radelim, not pl_radelim…).
const LIM_OVERRIDES = { pl_rade: 'pl_radelim', pl_bmasse: 'pl_bmasselim' }
export const limColumn = (col) => LIM_OVERRIDES[col] ?? `${col}lim`

export const QUANTITY_COLUMNS = [
  ...Object.values(PLANET_FIELDS),
  ...Object.values(STAR_FIELDS),
  ...Object.values(SYSTEM_QUANTITIES),
]

/** Every column requested from TAP, de-duplicated, in a stable order. */
export const ALL_COLUMNS = [
  ...new Set([
    ...IDENTITY_COLUMNS,
    ...QUANTITY_COLUMNS.flatMap((c) => [c, `${c}_reflink`, `${c}err1`, `${c}err2`, limColumn(c)]),
  ]),
]
