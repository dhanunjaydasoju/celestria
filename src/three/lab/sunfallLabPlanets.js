// SUNFALL lab planets — owner: LEAD (Stage S3). Lab fixtures (real NASA
// rows) plus synthetic radius cases, clearly named as synthetic.

import { labPlanets } from './fixtures.js'

const base = labPlanets.find((p) => p.name === 'TRAPPIST-1 e') ?? labPlanets[0]
const synthetic = (id, name, radiusEarth) => ({ ...base, id, name, synthetic: true, radiusEarth })

export const SUNFALL_LAB_PLANETS = [
  ...labPlanets.filter((p) => !p.synthetic),
  synthetic('synthetic-upper-limit', 'Synthetic · radius < 1.5 R⊕', { value: 1.5, status: 'measured', limit: '<' }),
  synthetic('synthetic-lower-limit', 'Synthetic · radius > 3 R⊕', { value: 3, status: 'measured', limit: '>' }),
  synthetic('synthetic-estimated', 'Synthetic · estimated 2.4 R⊕', { value: 2.4, status: 'estimated' }),
  synthetic('synthetic-tiny', 'Synthetic · 0.3 R⊕ (enlarged)', { value: 0.3, status: 'measured', err: [0.02, -0.02] }),
  synthetic('synthetic-missing', 'Synthetic · radius missing', { value: null, status: 'missing' }),
  {
    ...synthetic('synthetic-no-temperature', 'Synthetic · 2 R⊕, no temperature data', { value: 2, status: 'measured' }),
    eqTempK: { value: null, status: 'missing' },
    insolationEarth: { value: null, status: 'missing' },
    semiMajorAxisAU: { value: null, status: 'missing' },
    star: { ...base.star, teff: { value: null, status: 'missing' }, lumLog: { value: null, status: 'missing' } },
  },
  synthetic('synthetic-imputed', 'Synthetic · radius imputed only', { value: 2.2, status: 'imputed' }),
]
