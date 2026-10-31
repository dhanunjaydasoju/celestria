// Habitable-zone chart helpers — owner: AI (implemented by LEAD in M5 Phase B).
// Pure functions shared by the profile strip and the dashboard diagram.

import { TEFF_MAX_K, TEFF_MIN_K, seff } from '../../science/habitableZone.js'
import { formatMeasurement } from '../data/formatMeasurement.js'

/** Log scale for stellar flux; x grows to the right as flux DEcreases (hot → cold). */
export function fluxScale(maxFlux, minFlux, x0, x1) {
  const a = Math.log10(maxFlux)
  const b = Math.log10(minFlux)
  const toX = (s) => x0 + ((a - Math.log10(s)) / (a - b)) * (x1 - x0)
  const fromX = (x) => 10 ** (a - ((x - x0) / (x1 - x0)) * (a - b))
  return { toX, fromX, ticks: fluxTicks(maxFlux, minFlux) }
}

/** Readable ticks between two fluxes (1-2-5 per decade). */
export function fluxTicks(maxFlux, minFlux) {
  const out = []
  for (let e = Math.floor(Math.log10(minFlux)); e <= Math.ceil(Math.log10(maxFlux)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e
      if (v >= minFlux * 0.999 && v <= maxFlux * 1.001) out.push(Number(v.toPrecision(3)))
    }
  }
  return out
}

/**
 * Band outline in (flux, Teff) space between two limits, sampled over the
 * model's temperature range: [[flux, teff], …] going up one edge and down the other.
 */
export function bandPolygon(innerLimit, outerLimit, step = 50) {
  const up = []
  const down = []
  for (let t = TEFF_MIN_K; t <= TEFF_MAX_K; t += step) {
    up.push([seff(innerLimit, t), t])
    down.unshift([seff(outerLimit, t), t])
  }
  return [...up, ...down]
}

/** Boundary curve [[flux, teff], …] for one limit. */
export function limitCurve(limit, step = 50) {
  const out = []
  for (let t = TEFF_MIN_K; t <= TEFF_MAX_K; t += step) out.push([seff(limit, t), t])
  return out
}

/** Size categories used for colour (thresholds from src/science/habitability.js RULES). */
export const SIZE_CLASSES = [
  { key: 'small', label: '≤ 1.6 R⊕', test: (r) => r != null && r <= 1.6 },
  { key: 'mid', label: '1.6–2.5 R⊕', test: (r) => r != null && r > 1.6 && r <= 2.5 },
  { key: 'large', label: '> 2.5 R⊕', test: (r) => r != null && r > 2.5 },
  { key: 'unknown', label: 'Radius unknown', test: (r) => r == null },
]
export const sizeClassOf = (radius) => SIZE_CLASSES.find((c) => c.test(radius)).key

/**
 * A value with its asymmetric uncertainty, rounded to the precision the
 * uncertainty supports (as on the profile), e.g. "1.005 +0.084 −0.079".
 */
export function withErr(value, err) {
  if (value == null) return '—'
  const f = formatMeasurement(value, err)
  if (!f.plus) return f.value
  return f.symmetric ? `${f.value} ±${f.plus}` : `${f.value} +${f.plus} −${f.minus}`
}
