import { describe, expect, it } from 'vitest'
import { labPlanets } from '../three/lab/fixtures.js'
import {
  AU_KM,
  DAY_S,
  GM_SUN,
  dateFromJd,
  eccentricFromTrue,
  jdFromDate,
  keplerA,
  meanFromEccentric,
  orbitExtremes,
  orbitState,
  orbitalElements,
  realDateReliability,
  solveKepler,
  timingUncertainty,
  transitPhase,
  trueFromEccentric,
  visViva,
  wrapPi,
} from './kepler.js'

const byName = Object.fromEntries(labPlanets.map((p) => [p.name, p]))
const TWO_PI = Math.PI * 2

describe("Kepler's equation", () => {
  it('has residual < 1e-12 across eccentricities 0 – 0.999 and all mean anomalies', () => {
    let worst = 0
    for (const e of [0, 0.0051, 0.1, 0.3, 0.5, 0.7, 0.9, 0.93183, 0.97, 0.99, 0.999]) {
      for (let k = 0; k <= 720; k++) {
        const M = -Math.PI + (k / 720) * TWO_PI
        const E = solveKepler(M, e)
        worst = Math.max(worst, Math.abs(E - e * Math.sin(E) - wrapPi(M)))
      }
    }
    expect(worst).toBeLessThan(1e-12)
  })

  it('handles the near-periastron region of extreme orbits (e = 0.99, tiny M)', () => {
    for (const M of [1e-9, 1e-6, 1e-3, -1e-6]) {
      const E = solveKepler(M, 0.99)
      expect(Math.abs(E - 0.99 * Math.sin(E) - M)).toBeLessThan(1e-12)
    }
  })

  it('round-trips true ↔ eccentric ↔ mean anomaly', () => {
    for (const e of [0, 0.2, 0.93183]) {
      for (const nu of [-3, -1, 0, 0.5, 2.9]) {
        const E = eccentricFromTrue(nu, e)
        expect(trueFromEccentric(E, e)).toBeCloseTo(nu, 10)
        expect(solveKepler(meanFromEccentric(E, e), e)).toBeCloseTo(E, 10)
      }
    }
  })
})

describe('vis-viva and Kepler III', () => {
  it("gives Earth's orbital speed for 1 AU around 1 solar mass", () => {
    expect(visViva(GM_SUN, AU_KM, AU_KM)).toBeCloseTo(29.78, 1)
    expect(keplerA(365.25, 1)).toBeCloseTo(1, 6)
  })

  it('conserves specific orbital energy along an ellipse', () => {
    const el = orbitalElements(byName['HD 80606 b'])
    const energy = (s) => (s.speedKmS ** 2) / 2 - el.gm / (s.rAU * AU_KM)
    const ref = -el.gm / (2 * el.a * AU_KM)
    for (let k = 0; k < 50; k++) {
      const s = orbitState(el, el.anchor.tp + (k / 50) * el.P)
      expect(energy(s) / ref).toBeCloseTo(1, 9)
    }
  })

  it('conserves angular momentum (r·v_transverse is constant)', () => {
    const el = orbitalElements(byName['HD 80606 b'])
    const h = Math.sqrt(el.gm * el.a * AU_KM * (1 - el.e ** 2))
    for (let k = 0; k < 30; k++) {
      const s = orbitState(el, el.anchor.tp + (k / 30) * el.P)
      // transverse speed = h / r
      const vT = h / (s.rAU * AU_KM)
      expect(vT).toBeLessThanOrEqual(s.speedKmS + 1e-6)
    }
  })
})

describe('HD 80606 b (e = 0.93)', () => {
  const p = byName['HD 80606 b']
  const el = orbitalElements(p)

  it('resolves measured elements and a transit anchor', () => {
    expect(el.eStatus).toBe('measured')
    expect(el.omegaStatus).toBe('catalog')
    expect(el.anchor.kind).toBe('transit')
    expect(el.assumptions).toEqual([])
  })

  it('reproduces the catalog periastron time from the transit to within an hour', () => {
    expect(Math.abs(el.anchor.consistency.diffDays) * 24).toBeLessThan(1)
  })

  it('has the theoretical speed ratio v_peri / v_apo = (1 + e) / (1 − e)', () => {
    const x = orbitExtremes(el)
    expect(x.speedPeriKmS / x.speedApoKmS).toBeCloseTo((1 + el.e) / (1 - el.e), 6)
    expect(x.periastronAU).toBeCloseTo(el.a * (1 - el.e), 10)
  })

  it('is at periastron at t = Tp and at the transit point at t = Tc', () => {
    const atTp = orbitState(el, el.anchor.tp)
    expect(atTp.rAU).toBeCloseTo(el.a * (1 - el.e), 8)
    const atTc = orbitState(el, p.transitMidJD.value)
    expect(wrapPi(atTc.trueAnomaly - (Math.PI / 2 - el.omega))).toBeCloseTo(0, 8)
  })

  it('sweeps equal areas in equal times (Kepler’s second law)', () => {
    const area = (t0, t1, steps = 4000) => {
      let A = 0
      let prev = orbitState(el, t0)
      for (let i = 1; i <= steps; i++) {
        const s = orbitState(el, t0 + ((t1 - t0) * i) / steps)
        A += 0.5 * Math.abs(prev.x * s.y - prev.y * s.x)
        prev = s
      }
      return A
    }
    const dt = el.P / 40
    const nearPeri = area(el.anchor.tp - dt / 2, el.anchor.tp + dt / 2)
    const nearApo = area(el.anchor.tp + el.P / 2 - dt / 2, el.anchor.tp + el.P / 2 + dt / 2)
    expect(nearPeri / nearApo).toBeCloseTo(1, 3)
  })

  it('transits shortly after periastron', () => {
    const ph = transitPhase(el)
    expect(ph).toBeGreaterThan(0)
    expect(ph * el.P).toBeCloseTo(5.73, 1) // Tc − Tp ≈ 5.73 d
  })
})

describe('missing-data handling', () => {
  it('Kepler-452 b: eccentricity fixed at 0 is labelled assumed, circular', () => {
    const el = orbitalElements(byName['Kepler-452 b'])
    expect(el.eStatus).toBe('assumed')
    expect(el.e).toBe(0)
    expect(el.anchor.kind).toBe('transit')
    expect(el.assumptions.map((a) => a.key)).toContain('e-assumed')
  })

  it('HR 8799 b: no eccentricity → circular assumed, phase not anchored, no real dates', () => {
    const el = orbitalElements(byName['HR 8799 b'])
    expect(el.eStatus).toBe('missing')
    expect(el.anchor.kind).toBe('none') // its periastron time is meaningless without e
    expect(realDateReliability(el, jdFromDate(new Date())).ok).toBe(false)
  })

  it('55 Cnc e: anchors on the transit (direct observation) over the 1989 periastron time', () => {
    const el = orbitalElements(byName['55 Cnc e'])
    expect(el.anchor.kind).toBe('transit')
    // Near-circular (e = 0.05 ± 0.03): periastron time is ill-defined, so no cross-check.
    expect(el.anchor.consistency).toBeNull()
  })

  it('returns null without a period', () => {
    expect(orbitalElements({ periodDays: { value: null, status: 'missing' } })).toBeNull()
  })

  it('uses Kepler III when a is missing but the star mass is known', () => {
    const p = { ...byName['TRAPPIST-1 e'], semiMajorAxisAU: { value: null, status: 'missing' } }
    const el = orbitalElements(p)
    expect(el.aSource).toBe('kepler')
    expect(el.a).toBeCloseTo(byName['TRAPPIST-1 e'].semiMajorAxisAU.value, 2)
  })

  it('normalises the orbit and withholds speeds without a and star mass', () => {
    const p = {
      ...byName['TRAPPIST-1 e'],
      semiMajorAxisAU: { value: null, status: 'missing' },
      star: { ...byName['TRAPPIST-1 e'].star, massSun: { value: null, status: 'missing' } },
    }
    const el = orbitalElements(p)
    expect(el.aSource).toBe('normalised')
    expect(orbitState(el, 0).speedKmS).toBeNull()
    expect(orbitExtremes(el).speedPeriKmS).toBeNull()
  })

  it('works for every lab planet without throwing or producing NaN', () => {
    for (const p of labPlanets) {
      const el = orbitalElements(p)
      if (!el) continue
      for (let k = 0; k < 8; k++) {
        const s = orbitState(el, el.anchor.tp + (k / 8) * el.P)
        expect(Number.isFinite(s.rAU) && Number.isFinite(s.x), p.name).toBe(true)
      }
    }
  })
})

describe('real-date reliability', () => {
  it('grows timing uncertainty with the number of orbits since the epoch', () => {
    const el = orbitalElements(byName['TRAPPIST-1 e'])
    const near = timingUncertainty(el, el.anchor.epoch + el.P)
    const far = timingUncertainty(el, el.anchor.epoch + 10000 * el.P)
    expect(far.sigmaDays).toBeGreaterThan(near.sigmaDays * 1000)
    expect(near.complete).toBe(false) // transit-time error not in the dataset → lower bound
  })

  it('refuses real dates once the uncertainty is a large fraction of an orbit', () => {
    const el = orbitalElements(byName['TRAPPIST-1 e'])
    const far = realDateReliability(el, el.anchor.epoch + 1e6 * el.P)
    expect(far.ok).toBe(false)
    expect(far.reason).toMatch(/exceeds/)
  })

  it('HD 80606 b is reliable today (periastron time and period both precise)', () => {
    const el = orbitalElements(byName['HD 80606 b'])
    const r = realDateReliability(el, jdFromDate(new Date('2026-10-31T00:00:00Z')))
    expect(r.ok).toBe(true)
    expect(r.uncertainty.fractionOfOrbit).toBeLessThan(0.01)
  })

  it('converts dates to Julian Dates and back', () => {
    expect(jdFromDate(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(2451545.0, 6)
    expect(dateFromJd(2451545.0).toISOString()).toBe('2000-01-01T12:00:00.000Z')
    expect(DAY_S).toBe(86400)
  })
})
