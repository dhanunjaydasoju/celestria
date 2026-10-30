// Synthetic test system for /lab/system — owner: LEAD. Exercises the
// distance paths real catalog systems may not hit (Kepler's third law,
// arbitrary placement, missing star data). Never shown outside the lab.

const M = { value: null, status: 'missing' }
const q = (value, status = 'measured') => ({ value, status })

function planet(id, name, fields) {
  return {
    id,
    name,
    host: 'Synthetic test system',
    synthetic: true,
    radiusEarth: M, massEarth: M, densityGcc: M, eqTempK: M, insolationEarth: M,
    periodDays: M, semiMajorAxisAU: M, eccentricity: M, inclinationDeg: M,
    periastronArgDeg: M, periastronTimeJD: M, transitMidJD: M,
    star: {
      name: 'Synthetic test system', spectralType: null,
      teff: q(4200), radiusSun: M, massSun: q(0.7),
      lumLog: M, metallicity: M, ageGyr: M,
    },
    discovery: { year: null, method: null, facility: null, telescope: null },
    system: { distancePc: M, planetCount: 3, starCount: 1, raDeg: null, decDeg: null, vMag: null },
    flags: { controversial: false, ttv: false },
    ...fields,
  }
}

export const labTestSystemPlanets = [
  planet('test-sys-catalog', 'Synthetic: catalog distance', {
    semiMajorAxisAU: q(0.05), periodDays: q(5.2), radiusEarth: q(1.2), eqTempK: q(900),
  }),
  planet('test-sys-kepler', 'Synthetic: Kepler distance', {
    periodDays: q(40), radiusEarth: q(3.1), eqTempK: q(420),
  }),
  planet('test-sys-arbitrary', 'Synthetic: no orbital data', {}),
]
