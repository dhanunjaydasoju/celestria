import { describe, expect, it } from 'vitest'
import { fitDistance, horizontalFov } from './framing.js'

const visibleHalfAngles = (d, r) => Math.asin(r / d)

describe('fitDistance', () => {
  it('fits by height on wide viewports', () => {
    const d = fitDistance(1, 35, 16 / 9, 1)
    expect(visibleHalfAngles(d, 1)).toBeCloseTo((35 / 2) * (Math.PI / 180))
  })

  it('fits by width on narrow viewports, so nothing is cropped', () => {
    for (const aspect of [320 / 568, 375 / 812, 0.4]) {
      const d = fitDistance(1, 35, aspect, 1)
      const halfX = (horizontalFov(35, aspect) / 2) * (Math.PI / 180)
      expect(visibleHalfAngles(d, 1)).toBeCloseTo(halfX)
      expect(d).toBeGreaterThan(fitDistance(1, 35, 1.5, 1))
    }
  })

  it('applies the margin and scales with radius', () => {
    expect(fitDistance(2, 35, 1)).toBeCloseTo(2 * fitDistance(1, 35, 1))
    expect(fitDistance(1, 35, 1, 1.2)).toBeGreaterThan(fitDistance(1, 35, 1, 1))
  })

  it('returns null for invalid input', () => {
    expect(fitDistance(0, 35, 1)).toBeNull()
    expect(fitDistance(1, 35, 0)).toBeNull()
  })
})
