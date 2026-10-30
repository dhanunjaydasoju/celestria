import { describe, expect, it } from 'vitest'
import { labPlanets } from '../three/lab/fixtures.js'
import { distanceLightYears, isFixedCircular, isModelBasedImaging, orbitalExtremes, surfaceGravity } from './derived.js'

const byName = Object.fromEntries(labPlanets.map((p) => [p.name, p]))
const q = (value, status = 'measured', extra) => ({ value, status, ...extra })

describe('surfaceGravity', () => {
  it('is 1 g for Earth-like inputs', () => {
    const g = surfaceGravity({ massEarth: q(1, 'measured', { kind: 'Mass' }), radiusEarth: q(1) })
    expect(g.value).toBeCloseTo(9.80665)
    expect(g.earthRatio).toBeCloseTo(1)
    expect(g.status).toBe('calculated')
  })

  it('propagates relative uncertainty', () => {
    const g = surfaceGravity({
      massEarth: q(1, 'measured', { kind: 'Mass', err: [0.1, -0.1] }),
      radiusEarth: q(1, 'measured', { err: [0.05, -0.05] }),
    })
    expect(g.err[0]).toBeCloseTo(9.80665 * Math.sqrt(0.01 + 0.01))
  })

  it('refuses minimum masses, estimated masses and calculated radii', () => {
    expect(surfaceGravity(byName['Proxima Cen b'])).toBeNull() // Msini + calculated radius
    expect(surfaceGravity(byName['Kepler-452 b'])).toBeNull() // M-R estimated mass
    expect(surfaceGravity(byName['51 Peg b'])).toBeNull() // calculated radius
  })

  it('refuses model-based masses and radii of directly imaged planets', () => {
    expect(isModelBasedImaging(byName['HR 8799 b'])).toBe(true)
    expect(surfaceGravity(byName['HR 8799 b'])).toBeNull()
  })

  it('works for a planet with measured mass and radius', () => {
    const g = surfaceGravity(byName['TRAPPIST-1 e'])
    expect(g.value).toBeGreaterThan(7)
    expect(g.value).toBeLessThan(9)
  })
})

describe('orbitalExtremes', () => {
  it('computes periastron and apoastron for an eccentric orbit', () => {
    const p = byName['HD 80606 b']
    const r = orbitalExtremes(p)
    expect(r.periastron.value).toBeCloseTo(p.semiMajorAxisAU.value * (1 - p.eccentricity.value))
    expect(r.apoastron.value).toBeGreaterThan(r.periastron.value)
  })

  it('refuses an eccentricity fixed at 0 in the fit', () => {
    expect(orbitalExtremes(byName['Kepler-452 b'])).toBeNull()
    expect(isFixedCircular(byName['Kepler-452 b'].eccentricity)).toBe(true)
    expect(isFixedCircular(byName['WASP-12 b'].eccentricity)).toBe(false)
  })

  it('returns null without eccentricity', () => {
    expect(orbitalExtremes({ semiMajorAxisAU: q(1), eccentricity: q(null, 'missing') })).toBeNull()
  })
})

describe('distanceLightYears', () => {
  it('converts parsecs and scales uncertainty', () => {
    const d = distanceLightYears(q(10, 'measured', { err: [0.1, -0.1] }))
    expect(d.value).toBeCloseTo(32.6156)
    expect(d.err[0]).toBeCloseTo(0.326156)
    expect(distanceLightYears(q(null, 'missing'))).toBeNull()
  })
})
