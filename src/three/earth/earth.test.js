import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Euler, Quaternion, SphereGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { AXIS_TILT, framing, sunComposition } from './composition.js'
import { craftPose, PHASE0, RAAN_DEG } from './craftPose.js'
import { attitude, INCLINATION_DEG, ORBIT_PERIOD_S, ORBIT_RADIUS, orbitPath, orbitState } from './orbit.js'
import { chooseTier, PREVIEW_TEXTURES, TIERS } from './quality.js'
import { globeYawForSun, latLonToVector, subsolarPoint } from './sunPosition.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const textureDir = path.resolve(here, '../../../public/textures/earth')
const close = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps)

describe('sunPosition', () => {
  it('puts the subsolar point at the tropics on the solstices and the equator at the equinox', () => {
    expect(subsolarPoint(new Date('2026-06-21T08:24:00Z')).latDeg).toBeCloseTo(23.44, 1)
    expect(subsolarPoint(new Date('2026-12-21T20:50:00Z')).latDeg).toBeCloseTo(-23.44, 1)
    expect(Math.abs(subsolarPoint(new Date('2026-03-20T14:46:00Z')).latDeg)).toBeLessThan(0.1)
  })

  it('puts the Sun over Greenwich near noon UTC and over the date line near midnight', () => {
    // Equation of time keeps it within a few degrees of 0° at 12:00 UTC.
    for (const d of ['2026-02-11', '2026-05-14', '2026-07-26', '2026-11-03']) {
      expect(Math.abs(subsolarPoint(new Date(`${d}T12:00:00Z`)).lonDeg)).toBeLessThan(4.5)
    }
    expect(Math.abs(subsolarPoint(new Date('2026-04-15T00:00:00Z')).lonDeg)).toBeGreaterThan(176)
    // The Sun moves west by 15° per hour.
    const a = subsolarPoint(new Date('2026-09-01T10:00:00Z')).lonDeg
    const b = subsolarPoint(new Date('2026-09-01T11:00:00Z')).lonDeg
    expect(a - b).toBeCloseTo(15, 0)
  })

  it('maps latitude/longitude exactly like THREE.SphereGeometry UVs', () => {
    const g = new SphereGeometry(1, 64, 32)
    const pos = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i += 97) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (v <= 0.001 || v >= 0.999) continue
      const lon = u * 360 - 180 // equirectangular: left edge = −180°
      const lat = v * 180 - 90
      expect(close(latLonToVector(lat, lon), [pos.getX(i), pos.getY(i), pos.getZ(i)], 1e-5)).toBe(true)
    }
  })

  it('turns the globe so the subsolar point faces the chosen Sun azimuth', () => {
    const yaw = globeYawForSun(-75, 40)
    const v = new Vector3(...latLonToVector(10, -75)).applyEuler(new Euler(0, yaw, 0))
    expect(close(v.toArray(), latLonToVector(10, 40), 1e-9)).toBe(true)
  })
})

describe('composition', () => {
  it('lights the real subsolar point in the scene', () => {
    const date = new Date('2026-11-01T18:30:00Z')
    const c = sunComposition(date)
    const s = subsolarPoint(date)
    const lit = new Vector3(...latLonToVector(s.latDeg, s.lonDeg)).applyEuler(new Euler(0, c.yaw, 0)).applyQuaternion(new Quaternion().setFromEuler(AXIS_TILT))
    expect(close(lit.toArray(), c.sunWorld, 1e-6)).toBe(true)
    expect(c.sunLocal[1]).toBeCloseTo(Math.sin((s.latDeg * Math.PI) / 180), 9)
    expect(Math.hypot(...c.sunWorld)).toBeCloseTo(1, 9)
  })

  it('keeps Earth right of the text on wide screens and fits the orbit on tall ones', () => {
    const wide = framing(1.7, 28)
    expect(wide.layout).toBe('wide')
    expect(wide.earth[0]).toBeGreaterThan(0.8)
    const tall = framing(375 / 756, 28)
    expect(tall).toMatchObject({ layout: 'tall', earth: [0, expect.any(Number), 0] })
    const halfW = tall.distance * Math.tan((14 * Math.PI) / 180) * (375 / 756)
    expect(halfW).toBeGreaterThanOrEqual(ORBIT_RADIUS * 1.05)
  })
})

describe('orbit', () => {
  it('is a continuous circle of constant radius with the 51.6° inclination', () => {
    let prev = null
    for (let t = 0; t <= ORBIT_PERIOD_S; t += 0.25) {
      const { position, velocity } = orbitState(t, { raanDeg: RAAN_DEG, phase: PHASE0 })
      expect(Math.hypot(...position)).toBeCloseTo(ORBIT_RADIUS, 9)
      expect(Math.abs(position[0] * velocity[0] + position[1] * velocity[1] + position[2] * velocity[2])).toBeLessThan(1e-9) // velocity ⟂ radius
      if (prev) expect(Math.hypot(...position.map((c, i) => c - prev[i]))).toBeLessThan(0.03) // no jumps
      prev = position
    }
    const a = new Vector3(...orbitState(0).position)
    const b = new Vector3(...orbitState(ORBIT_PERIOD_S / 4).position)
    const normal = a.clone().cross(b).normalize()
    expect((Math.acos(normal.y) * 180) / Math.PI).toBeCloseTo(INCLINATION_DEG, 6)
    expect(close(orbitState(5).position, orbitState(5 + ORBIT_PERIOD_S).position, 1e-9)).toBe(true) // periodic
    expect(orbitPath(64)).toHaveLength(65)
  })

  it('keeps the nose along the velocity and turns the solar arrays to the Sun', () => {
    const sun = [-0.8, 0.3, 0.52]
    for (let t = 0; t < ORBIT_PERIOD_S; t += 3) {
      const { velocity } = orbitState(t, { raanDeg: RAAN_DEG })
      const { forward, panelNormal, span } = attitude(velocity, sun)
      const d = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2]
      expect(Math.abs(d(forward, panelNormal))).toBeLessThan(1e-9)
      expect(Math.abs(d(forward, span))).toBeLessThan(1e-9)
      expect(Math.abs(d(panelNormal, span))).toBeLessThan(1e-9)
      expect(d(panelNormal, sun)).toBeGreaterThanOrEqual(0) // faces the Sun side
      // The face is as Sun-facing as a roll about the long axis allows.
      const perp = Math.sqrt(Math.max(0, d(sun, sun) - d(sun, forward) ** 2))
      expect(d(panelNormal, sun)).toBeCloseTo(perp, 9)
    }
    // Degenerate case: Sun exactly along the track still gives a valid basis.
    const deg = attitude([1, 0, 0], [1, 0, 0])
    expect(Math.hypot(...deg.panelNormal)).toBeCloseTo(1, 9)
  })

  it('orients the model: local +Z (nose) along the velocity, +Y (array face) towards the Sun', () => {
    const sun = [-0.5, 0.2, 0.84]
    const pose = craftPose(12, sun)
    const nose = new Vector3(0, 0, 1).applyQuaternion(pose.quaternion)
    const face = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion)
    expect(close(nose.toArray(), pose.forward, 1e-6)).toBe(true)
    expect(close(face.toArray(), pose.panelNormal, 1e-6)).toBe(true)
  })
})

describe('quality and assets', () => {
  it('chooses the low tier for phones, weak or data-saving devices', () => {
    expect(chooseTier({ width: 1440, cores: 8, memoryGB: 8 })).toBe('high')
    expect(chooseTier({ width: 1440 })).toBe('high')
    expect(chooseTier({ width: 390, cores: 8 })).toBe('low')
    expect(chooseTier({ width: 1440, cores: 4 })).toBe('low')
    expect(chooseTier({ width: 1440, memoryGB: 2 })).toBe('low')
    expect(chooseTier({ width: 1440, saveData: true })).toBe('low')
    expect(TIERS.low.scattering).toBe(false)
  })

  it('ships every referenced texture locally, each credited, and nothing uncredited', () => {
    const referenced = new Set([...Object.values(TIERS.high.textures), ...Object.values(TIERS.low.textures), ...Object.values(PREVIEW_TEXTURES)])
    const credits = readFileSync(path.join(textureDir, 'CREDITS.md'), 'utf8')
    for (const f of referenced) {
      expect(existsSync(path.join(textureDir, f)), f).toBe(true)
      expect(credits, f).toContain(f)
    }
    for (const f of readdirSync(textureDir).filter((n) => n.endsWith('.jpg'))) expect(credits, f).toContain(f)
    expect(credits).toMatch(/NASA Earth Observatory/)
    expect(credits).toMatch(/nasa\.gov\/nasa-brand-center\/images-and-media/)
  })

  it('labels the scene honestly', () => {
    const scene = readFileSync(path.resolve(here, '../viewports/EarthHeroScene.jsx'), 'utf8')
    expect(scene).toMatch(/NASA Earth Observatory/)
    expect(scene).toMatch(/not to scale/)
    expect(scene).toMatch(/Soyuz-inspired illustration/)
    expect(scene).not.toMatch(/https?:\/\//) // no remote assets
  })
})
