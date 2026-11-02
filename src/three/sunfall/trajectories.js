// SUNFALL copy trajectories — owner: LEAD (Stage S3). Pure and seeded: the
// same planet always produces the same flight, so replays are identical.
//
// Each copy flies a quadratic Bézier from a start point to a point just
// inside the Sun's visible face. About 30 % start between the camera and the
// Sun, off to the edges of the frame, and sweep in; the rest start in the
// deep field around the Sun, near its own depth, so perspective exaggerates
// copy sizes as little as possible. Arrivals are spaced so that the share
// arrived at progress u equals arrivalFraction(u): the counter and the swarm
// stay in step.

import { arrivalProgress } from './plan.js'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed from a planet id (FNV-1a). */
export function seedFrom(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * @param {number} count
 * @param {{ sunRadius: number, cameraZ: number, lead: number, duration: number, seed: number, copyRadius?: number }} opts
 * @returns {{ start: Float32Array, ctrl: Float32Array, end: Float32Array, time: Float32Array, spin: Float32Array }}
 *   time: [launch, arrival] seconds per copy; spin: [rate rad/s, phase, tilt]
 */
export function buildTrajectories(count, { sunRadius: R, cameraZ, lead, duration, seed, copyRadius = 0 }) {
  const rand = mulberry32(seed)
  const start = new Float32Array(count * 3)
  const ctrl = new Float32Array(count * 3)
  const end = new Float32Array(count * 3)
  const time = new Float32Array(count * 2)
  const spin = new Float32Array(count * 3)
  const cam = [0, 0, cameraZ]

  for (let i = 0; i < count; i++) {
    // Start point.
    let s
    if (rand() < 0.3) {
      // Near field: in front of the camera and off to the edges of the frame,
      // so copies sweep in from the sides and shrink towards the Sun.
      const a = rand() * Math.PI * 2
      const rho = R * (1.7 + rand() * 1.3)
      s = [Math.cos(a) * rho, Math.sin(a) * rho * 0.7, cameraZ * (0.15 + rand() * 0.25)]
    } else {
      // Deep field: a shell around the Sun, mostly on the camera's side.
      const z = -0.4 + rand() * 0.85 //  at most ~0.45 of the way towards the camera
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z)))
      const d = R * (2.4 + rand() * 1.6)
      s = [Math.cos(a) * r * d, Math.sin(a) * r * d * 0.8, z * d]
    }
    // Keep every start well clear of the lens, more so for large copies.
    const clearance = Math.max(R * 0.9, copyRadius * 14)
    const toCam = len(sub(s, cam))
    if (toCam < clearance) {
      const k = clearance / Math.max(toCam, 1e-6)
      s = [cam[0] + (s[0] - cam[0]) * k, cam[1] + (s[1] - cam[1]) * k, cam[2] + (s[2] - cam[2]) * k]
    }

    // End point: just inside the visible face, so the copy sinks into the surface.
    const ez = 0.08 + rand() ** 1.6 * 0.92 // biased towards the limb, keeping the disc centre clearer
    const ea = rand() * Math.PI * 2
    const er = Math.sqrt(1 - ez * ez)
    const e = [Math.cos(ea) * er * R * 0.985, Math.sin(ea) * er * R * 0.985, ez * R * 0.985]

    // Control point: midpoint pushed sideways for a curved path.
    const chord = sub(e, s)
    const side = norm(cross(chord, [rand() - 0.5, rand() - 0.5, rand() - 0.5]))
    const bend = len(chord) * (0.15 + rand() * 0.3)
    const c = [(s[0] + e[0]) / 2 + side[0] * bend, (s[1] + e[1]) / 2 + side[1] * bend, (s[2] + e[2]) / 2 + side[2] * bend]

    // Timing: arrivals follow the counting curve. Flights last 2.6–5 s, or
    // 1.6–2.8 s for large copies so fewer cover the Sun at once.
    const arrive = lead + duration * arrivalProgress((i + 0.5) / count)
    const big = copyRadius > R * 0.05
    const flight = Math.min(big ? 1.6 + rand() * 1.2 : 2.6 + rand() * 2.4, arrive)

    start.set(s, i * 3)
    ctrl.set(c, i * 3)
    end.set(e, i * 3)
    time.set([arrive - flight, arrive], i * 2)
    spin.set([0.2 + rand() * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.8], i * 3)
  }
  return { start, ctrl, end, time, spin }
}
