import { describe, expect, it } from 'vitest'
import { SUN_RADIUS_EARTH, sunfallResult } from '../../science/sunfall.js'
import { CAMERA_Z, SUN_SCENE_RADIUS, cameraPose, distanceScale } from './camera.js'
import { createClock, finish, pause, replay, resume, tick, toggle } from './clock.js'
import {
  MAX_COPIES,
  MIN_COPY_FRACTION,
  SWARM_DURATION,
  SWARM_LEAD,
  arrivalFraction,
  arrivalProgress,
  copyScale,
  counterText,
  perCopyText,
  planSwarm,
  progressAt,
} from './plan.js'
import { buildTrajectories, seedFrom } from './trajectories.js'

const q = (value, status = 'measured', extra = {}) => ({ value, status, ...extra })
const planet = (radiusEarth, extra = {}) => ({ id: 'p', name: 'P', host: 'H', radiusEarth, massEarth: { value: null, status: 'missing' }, star: {}, system: {}, discovery: { method: 'Transit' }, ...extra })
const R = SUN_SCENE_RADIUS
const plan = (result, tier = 'high') => planSwarm(result, { tier, sunSceneRadius: R })

const earthLike = sunfallResult(planet(q(1, 'measured', { err: [0.01, -0.01] }))) // ≈ 1.302 million
const giant = sunfallResult(planet(q(22))) // ≈ 122
const upper = sunfallResult(planet(q(2, 'measured', { limit: '<' }))) // > 160,000
const lower = sunfallResult(planet(q(2, 'measured', { limit: '>' }))) // < 170,000
const missing = sunfallResult(planet({ value: null, status: 'missing' }))
const imputed = sunfallResult(planet(q(2.2, 'imputed')))

describe('planSwarm', () => {
  it('caps drawn copies by tier and says what each one stands for', () => {
    const high = plan(earthLike, 'high')
    const low = plan(earthLike, 'low')
    expect(high).toMatchObject({ animate: true, copies: MAX_COPIES.high, oneToOne: false, target: earthLike.ratio })
    expect(low.copies).toBe(MAX_COPIES.low)
    expect(high.perCopy * high.copies).toBeCloseTo(earthLike.ratio, 6)
    expect(perCopyText(high)).toBe('Each copy shown stands for about 1,090 planet volumes')
  })

  it('draws one copy per planet volume when the count fits', () => {
    const p = plan(giant)
    expect(p).toMatchObject({ oneToOne: true, copies: 122 })
    expect(perCopyText(p)).toBeNull()
  })

  it('never draws one-to-one for a bound, and words each copy as a bound', () => {
    const big = plan(sunfallResult(planet(q(22, 'measured', { limit: '<' }))))
    expect(big.oneToOne).toBe(false)
    expect(perCopyText(plan(upper))).toMatch(/^Each copy shown stands for at least /)
    expect(perCopyText(plan(lower))).toMatch(/^Each copy shown stands for at most /)
  })

  it('does not animate without a usable radius', () => {
    expect(plan(missing)).toEqual({ animate: false, reason: missing.reason })
    expect(plan(imputed).animate).toBe(false)
    expect(plan(null).animate).toBe(false)
  })

  it('times a lead-in flight, then the arrivals', () => {
    const p = plan(giant)
    expect(p).toMatchObject({ lead: SWARM_LEAD, duration: SWARM_DURATION, total: SWARM_LEAD + SWARM_DURATION })
  })
})

describe('copyScale', () => {
  it('draws copies at true size relative to the Sun when visible enough', () => {
    const s = copyScale(1, R)
    expect(s).toMatchObject({ enlarged: false, factor: 1 })
    expect(s.scene).toBeCloseTo(R / SUN_RADIUS_EARTH, 9)
  })

  it('enlarges tiny copies to a floor and reports the factor', () => {
    const s = copyScale(0.3, R)
    expect(s.enlarged).toBe(true)
    expect(s.scene).toBeCloseTo(R * MIN_COPY_FRACTION, 10)
    expect(s.factor).toBeCloseTo((R * MIN_COPY_FRACTION) / ((0.3 / SUN_RADIUS_EARTH) * R), 9)
  })
})

describe('counter', () => {
  it('is the S1 value × the share arrived, never the number of copies drawn', () => {
    const high = plan(earthLike, 'high')
    const low = plan(earthLike, 'low')
    expect(high.copies).not.toBe(low.copies)
    for (const u of [0, 0.25, 0.5, 0.9]) {
      const expected = Math.floor(earthLike.animation.target * arrivalFraction(u))
      expect(counterText(earthLike, u).value.replace(/,/g, '')).toMatch(new RegExp(`^${expected >= 1e6 ? '\\d' : expected}`))
    }
    expect(counterText(earthLike, 0.5).value).toBe('651,048') // half of 1,302,097, not 600 copies
    expect(counterText(earthLike, 0).value).toBe('0')
  })

  it('ends on exactly the S1 display value with its relation', () => {
    expect(counterText(earthLike, 1)).toEqual({ value: '≈ 1.302 million', final: true })
    expect(counterText(giant, 1).value).toBe('≈ 122')
    expect(counterText(upper, 1).value).toBe('More than 160,000')
    expect(counterText(lower, 1).value).toBe('Fewer than 170,000')
  })

  it('counts up to a bound, never past it', () => {
    const v = Number(counterText(upper, 0.999).value.replace(/,/g, ''))
    expect(v).toBeLessThanOrEqual(upper.animation.target)
  })

  it('has no counter without a usable radius', () => {
    expect(counterText(missing, 0.5)).toBeNull()
    expect(counterText(imputed, 1)).toBeNull()
  })

  it('stays at zero during the lead-in flight', () => {
    expect(progressAt(0)).toBe(0)
    expect(progressAt(SWARM_LEAD)).toBe(0)
    expect(progressAt(SWARM_LEAD + SWARM_DURATION / 2)).toBeCloseTo(0.5, 10)
    expect(progressAt(999)).toBe(1)
  })
})

describe('arrival curve', () => {
  it('arrivalProgress inverts arrivalFraction', () => {
    for (const y of [0, 0.1, 0.25, 0.5, 0.75, 0.99, 1]) expect(arrivalFraction(arrivalProgress(y))).toBeCloseTo(y, 9)
    expect(arrivalFraction(-1)).toBe(0)
    expect(arrivalFraction(2)).toBe(1)
  })
})

describe('trajectories', () => {
  const opts = { sunRadius: R, cameraZ: CAMERA_Z, lead: SWARM_LEAD, duration: SWARM_DURATION, seed: seedFrom('trappist-1-e'), copyRadius: 0.1 }
  const n = 400
  const t = buildTrajectories(n, opts)

  it('is deterministic per planet', () => {
    expect(buildTrajectories(n, opts)).toEqual(t)
    expect(buildTrajectories(n, { ...opts, seed: seedFrom('other') }).start).not.toEqual(t.start)
  })

  it('keeps the swarm in step with the counter: arrivals follow the counting curve', () => {
    const arrivals = Array.from({ length: n }, (_, i) => t.time[i * 2 + 1])
    for (let i = 1; i < n; i++) expect(arrivals[i]).toBeGreaterThanOrEqual(arrivals[i - 1])
    for (const u of [0.2, 0.5, 0.8]) {
      const at = SWARM_LEAD + u * SWARM_DURATION
      const arrived = arrivals.filter((a) => a <= at).length / n
      expect(Math.abs(arrived - arrivalFraction(u))).toBeLessThan(2 / n + 1e-9)
    }
    expect(arrivals.at(-1)).toBeLessThanOrEqual(SWARM_LEAD + SWARM_DURATION)
  })

  it('launches every copy before it arrives, never before time zero', () => {
    for (let i = 0; i < n; i++) {
      expect(t.time[i * 2]).toBeGreaterThanOrEqual(0)
      expect(t.time[i * 2]).toBeLessThan(t.time[i * 2 + 1])
    }
  })

  it('ends every copy just inside the Sun’s visible face', () => {
    for (let i = 0; i < n; i++) {
      const [x, y, z] = [t.end[i * 3], t.end[i * 3 + 1], t.end[i * 3 + 2]]
      expect(Math.hypot(x, y, z)).toBeLessThan(R)
      expect(Math.hypot(x, y, z)).toBeGreaterThan(R * 0.97)
      expect(z).toBeGreaterThan(0) // faces the camera
    }
  })

  it('starts every copy clear of the camera, more so for large copies', () => {
    const big = buildTrajectories(n, { ...opts, copyRadius: 2 })
    for (const [traj, clearance] of [
      [t, R * 0.9],
      [big, 28],
    ]) {
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(traj.start[i * 3], traj.start[i * 3 + 1], traj.start[i * 3 + 2] - CAMERA_Z)
        expect(d).toBeGreaterThanOrEqual(clearance - 1e-3)
      }
    }
  })
})

describe('playback clock', () => {
  it('plays from zero and finishes at the end', () => {
    let c = createClock(10)
    expect(c).toEqual({ t: 0, total: 10, playing: true, finished: false })
    for (let i = 0; i < 200; i++) c = tick(c, 0.1)
    expect(c).toMatchObject({ t: 10, playing: false, finished: true })
  })

  it('pauses and resumes without losing time', () => {
    let c = tick(createClock(10), 0.05)
    c = pause(c)
    const frozen = c.t
    for (let i = 0; i < 10; i++) c = tick(c, 0.1)
    expect(c.t).toBe(frozen)
    c = resume(c)
    c = tick(c, 0.05)
    expect(c.t).toBeCloseTo(frozen + 0.05, 10)
    expect(toggle(c).playing).toBe(false)
    expect(toggle(toggle(c)).playing).toBe(true)
  })

  it('replays from the start, and skips to the result', () => {
    const done = finish(tick(createClock(10), 0.05))
    expect(done).toMatchObject({ t: 10, finished: true, playing: false })
    expect(resume(done)).toBe(done) // a finished clock needs replay
    expect(replay(done)).toEqual(createClock(10))
  })

  it('starts at the result and stays still with reduced motion', () => {
    const c = createClock(10, { reducedMotion: true })
    expect(c).toEqual({ t: 10, total: 10, playing: false, finished: true })
    expect(tick(c, 0.1)).toBe(c)
    expect(replay(c, { reducedMotion: true })).toEqual(c)
  })

  it('caps a large frame gap so a stalled tab does not jump ahead', () => {
    expect(tick(createClock(10), 5).t).toBeCloseTo(0.1, 10)
    expect(tick(createClock(10), -1).t).toBe(0)
  })
})

describe('camera', () => {
  it('pushes in over the sequence, deterministically from time', () => {
    expect(cameraPose(0, 10)[2]).toBeCloseTo(CAMERA_Z, 10)
    expect(cameraPose(10, 10)[2]).toBeLessThan(CAMERA_Z)
    expect(cameraPose(4, 10)).toEqual(cameraPose(4, 10))
  })

  it('moves back on portrait screens so the Sun fits the width', () => {
    expect(distanceScale(16 / 9)).toBe(1)
    expect(distanceScale(0.46)).toBeGreaterThan(1)
    expect(cameraPose(10, 10, 0.46)[2]).toBeGreaterThan(cameraPose(10, 10, 16 / 9)[2])
  })
})
