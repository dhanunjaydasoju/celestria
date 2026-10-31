// Synthetic planets for AI tool and validator tests — owner: AI (LEAD in M5).
// Fixed values (independent of NASA refreshes) covering every provenance
// case: measured with asymmetric errors, M sin i, mass–radius estimates,
// limits, fixed circular orbits, missing values and a defensive imputed value.

import { missing, planetSlug, quantity } from '../../../src/contracts/planet.js'

const SRC = { label: 'Doe et al. 2020', url: 'https://ui.adsabs.harvard.edu/abs/2020Doe' }
const SRC2 = { label: 'Roe & Poe 2022', url: 'https://ui.adsabs.harvard.edu/abs/2022Roe' }
const m = (value, err, extra = {}) => quantity(value, 'measured', { err, source: SRC, ...extra })

const star = (over = {}) => ({
  name: over.name,
  spectralType: 'M4 V',
  teff: m(3200, [50, -50]),
  radiusSun: m(0.2, [0.01, -0.01]),
  massSun: m(0.18, [0.01, -0.01]),
  lumLog: m(-2.4, [0.02, -0.03]),
  metallicity: missing(),
  ageGyr: missing(),
  ...over,
})

function planet(name, host, fields, extra = {}) {
  const blank = Object.fromEntries(
    ['radiusEarth', 'massEarth', 'densityGcc', 'eqTempK', 'insolationEarth', 'periodDays', 'semiMajorAxisAU', 'eccentricity', 'inclinationDeg', 'periastronArgDeg', 'periastronTimeJD', 'transitMidJD'].map((k) => [k, missing()]),
  )
  return {
    id: planetSlug(name),
    name,
    host,
    ...blank,
    ...fields,
    star: star({ name: host, ...extra.star }),
    discovery: { year: 2020, method: 'Transit', facility: 'TESS', telescope: null, ...extra.discovery },
    system: { distancePc: m(5.5, [0.01, -0.02]), planetCount: extra.planetCount ?? 1, starCount: 1, raDeg: 0, decDeg: 0, vMag: 12, ...extra.system },
    flags: { controversial: false, ttv: false, ...extra.flags },
  }
}

export const FIXTURE_PLANETS = [
  // Fully measured, asymmetric radius error, transit-anchored timing.
  planet('Testa b', 'Testa', {
    radiusEarth: m(1.1, [0.05, -0.03]),
    massEarth: m(1.3, [0.2, -0.2], { kind: 'Mass' }),
    densityGcc: m(5.4, [0.6, -0.5]),
    eqTempK: m(250, [10, -10]),
    insolationEarth: m(0.9, [0.1, -0.1]),
    periodDays: m(10.5, [0.0001, -0.0001]),
    semiMajorAxisAU: m(0.05, [0.001, -0.001]),
    eccentricity: m(0.1, [0.02, -0.02], { source: SRC2 }),
    inclinationDeg: m(89.5, [0.2, -0.2]),
    periastronArgDeg: m(90, [5, -5]),
    transitMidJD: m(2459000.5, [0.0002, -0.0002]),
  }, { planetCount: 2 }),
  // Minimum mass, no radius, fixed circular orbit, and an imputed temperature
  // that must never surface.
  planet('Testa c', 'Testa', {
    massEarth: m(8.2, [0.9, -0.8], { kind: 'Msini' }),
    eqTempK: quantity(400, 'imputed'),
    periodDays: m(30.2, [0.01, -0.01]),
    semiMajorAxisAU: m(0.11, [0.002, -0.002]),
    eccentricity: m(0, undefined),
  }, { planetCount: 2 }),
  // Mass–radius estimate, upper-limit insolation, calculated radius.
  planet('Solo b', 'Solo', {
    radiusEarth: quantity(2.5, 'calculated', { source: { label: 'Calculated Value', url: 'https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html' } }),
    massEarth: quantity(6.9, 'estimated', { kind: 'M-R', source: SRC }),
    insolationEarth: m(3, undefined, { limit: '<' }),
    periodDays: m(2.2, [0.001, -0.001]),
    eqTempK: m(900, [40, -40]),
  }, { star: { spectralType: 'G2 V', teff: m(5800, [80, -80]) }, system: { distancePc: m(40, [1, -1]) } }),
  // Directly imaged giant without a period: nothing to simulate.
  planet('Far b', 'Far', {
    radiusEarth: m(13, [1, -1]),
    massEarth: m(2000, [300, -300], { kind: 'Mass' }),
    semiMajorAxisAU: m(70, [5, -5]),
  }, { discovery: { method: 'Imaging', year: 2008 }, star: { spectralType: 'A5 V', teff: m(7400, [100, -100]) }, system: { distancePc: missing() } }),
  // Controversial hot Jupiter.
  planet('Disputed b', 'Disputed', {
    radiusEarth: m(12, [0.5, -0.5]),
    massEarth: m(300, [20, -20], { kind: 'Mass' }),
    periodDays: m(3.1, [0.0001, -0.0001]),
    eqTempK: m(1500, [50, -50]),
  }, { flags: { controversial: true }, star: { spectralType: 'F8 V', teff: m(6100, [90, -90]) }, system: { distancePc: m(8, [0.1, -0.1]) } }),
]
