import { describe, expect, it } from 'vitest'
import {
  createSizeCompareScale,
  displayOrbitSeconds,
  layoutOrbits,
  planetDisplayRadius,
  starDisplayRadius,
} from './scale.js'

describe('planetDisplayRadius / starDisplayRadius', () => {
  it('returns null for missing or invalid input', () => {
    for (const v of [null, undefined, 0, -1, NaN]) {
      expect(planetDisplayRadius(v)).toBeNull()
      expect(starDisplayRadius(v)).toBeNull()
    }
  })

  it('preserves size order inside the clamp range', () => {
    const earth = planetDisplayRadius(1)
    const neptune = planetDisplayRadius(3.88)
    const jupiter = planetDisplayRadius(11.2)
    expect(earth).toBeCloseTo(0.35)
    expect(neptune).toBeGreaterThan(earth)
    expect(jupiter).toBeGreaterThan(neptune)
  })
})

describe('layoutOrbits', () => {
  it('orders planets by semi-major axis and keeps them outside the star', () => {
    const map = layoutOrbits(
      [
        { id: 'c', aAU: 0.0158 },
        { id: 'b', aAU: 0.0115 },
        { id: 'h', aAU: 0.0619 },
      ],
      { starRadius: 1 },
    )
    expect(map.get('b').radius).toBeGreaterThan(1)
    expect(map.get('b').radius).toBeLessThan(map.get('c').radius)
    expect(map.get('c').radius).toBeLessThan(map.get('h').radius)
    expect([...map.values()].every((v) => v.basis === 'distance')).toBe(true)
  })

  it('never infers distance itself: planets without aAU are arbitrary and placed last', () => {
    const map = layoutOrbits([{ id: 'known', aAU: 1 }, { id: 'periodOnly', periodDays: 32 }, { id: 'none' }])
    expect(map.get('periodOnly').basis).toBe('arbitrary')
    expect(map.get('none').basis).toBe('arbitrary')
    expect(map.get('periodOnly').radius).toBeGreaterThan(map.get('known').radius)
  })

  it('never lets neighbouring planets overlap', () => {
    const map = layoutOrbits([
      { id: 'a', aAU: 0.1, displayRadius: 1 },
      { id: 'b', aAU: 0.1001, displayRadius: 1 },
    ])
    expect(map.get('b').radius - map.get('a').radius).toBeGreaterThanOrEqual(2)
  })

  it('handles an empty system and an all-null system', () => {
    expect(layoutOrbits([]).size).toBe(0)
    const map = layoutOrbits([{ id: 'p' }, { id: 'q' }])
    expect(map.get('p').basis).toBe('arbitrary')
    expect(map.get('q').radius).toBeGreaterThan(map.get('p').radius)
  })
})

describe('displayOrbitSeconds', () => {
  it('maps Earth to the reference and keeps faster planets faster', () => {
    expect(displayOrbitSeconds(365.25)).toBeCloseTo(40)
    expect(displayOrbitSeconds(4)).toBeLessThan(displayOrbitSeconds(30))
    expect(displayOrbitSeconds(null)).toBeNull()
  })
})

describe('createSizeCompareScale', () => {
  it('is linear in true mode', () => {
    const s = createSizeCompareScale([1, 11.2], { mode: 'true', maxSceneRadius: 3 })
    expect(s.isTrueScale).toBe(true)
    expect(s.toScene(11.2)).toBeCloseTo(3)
    expect(s.toScene(1) / s.toScene(11.2)).toBeCloseTo(1 / 11.2)
    expect(s.isEnlarged(1)).toBe(false)
  })

  it('enlarges tiny bodies in visibility mode and reports it', () => {
    const s = createSizeCompareScale([1, 109.2], { mode: 'visibility', maxSceneRadius: 3, minVisibleRadius: 0.12 })
    expect(s.toScene(1)).toBeCloseTo(0.12)
    expect(s.isEnlarged(1)).toBe(true)
    expect(s.isEnlarged(109.2)).toBe(false)
  })

  it('returns null for a missing radius', () => {
    expect(createSizeCompareScale([1, null]).toScene(null)).toBeNull()
  })
})
