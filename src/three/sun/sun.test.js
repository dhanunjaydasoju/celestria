import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import * as starShaders from '../star/shaders.js'
import { SUN_LAYERS, SUN_PALETTE, SUN_TIERS, detectTier, limbDot, sunTier } from './quality.js'
import * as sunShaders from './shaders.js'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('Sun quality tiers', () => {
  it('has a high and a low tier, low cheaper on every fragment-cost axis', () => {
    const { high, low } = SUN_TIERS
    expect(low.dpr[1]).toBeLessThan(high.dpr[1])
    expect(low.octaves).toBeLessThan(high.octaves)
    expect(low.segments).toBeLessThan(high.segments)
    expect(low.granuleScale).toBeLessThan(high.granuleScale)
    expect(low.stars).toBeLessThan(high.stars)
    expect(high.dpr[1]).toBeLessThanOrEqual(1.5) // full-screen disc: capped for frame rate
    expect(Object.isFrozen(high)).toBe(true)
  })

  it('falls back to the low tier for unknown keys', () => {
    expect(sunTier('high')).toBe(SUN_TIERS.high)
    expect(sunTier('low')).toBe(SUN_TIERS.low)
    expect(sunTier('ultra')).toBe(SUN_TIERS.low)
    expect(sunTier(undefined)).toBe(SUN_TIERS.low)
  })

  it('reuses the homepage device detection (low outside a browser)', () => {
    expect(detectTier()).toBe('low')
  })
})

describe('Sun layers and palette', () => {
  it('orders the layers from the photosphere outward', () => {
    expect(SUN_LAYERS.chromosphere).toBeGreaterThan(1)
    expect(SUN_LAYERS.prominence).toBeGreaterThan(SUN_LAYERS.chromosphere)
    expect(SUN_LAYERS.coronaInner).toBeGreaterThan(SUN_LAYERS.prominence)
    expect(SUN_LAYERS.coronaOuter).toBeGreaterThan(SUN_LAYERS.coronaInner)
  })

  it('computes the limb angle on a shell: sqrt(1 − 1/s²)', () => {
    expect(limbDot(2)).toBeCloseTo(Math.sqrt(0.75), 12)
    expect(limbDot(SUN_LAYERS.chromosphere)).toBeGreaterThan(0)
    expect(limbDot(SUN_LAYERS.chromosphere)).toBeLessThan(0.3)
    expect(limbDot(1)).toBe(0)
    expect(limbDot(0.5)).toBe(0)
  })

  it('uses a warm palette that brightens from limb to core', () => {
    const lum = (hex) => {
      const c = new Color(hex)
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    }
    const order = [SUN_PALETTE.deep, SUN_PALETTE.mid, SUN_PALETTE.hot, SUN_PALETTE.core]
    for (let i = 1; i < order.length; i++) expect(lum(order[i])).toBeGreaterThan(lum(order[i - 1]))
    for (const hex of order) {
      const c = new Color(hex)
      expect(c.r).toBeGreaterThanOrEqual(c.g) // orange/yellow, never blue-white
      expect(c.g).toBeGreaterThanOrEqual(c.b)
    }
  })
})

describe('Sun shaders', () => {
  it('reuses the existing star vertex and corona shaders unchanged', () => {
    expect(sunShaders.sunVertex).toBe(starShaders.photosphereVertex)
    expect(sunShaders.coronaVertex).toBe(starShaders.coronaVertex)
    expect(sunShaders.coronaFragment).toBe(starShaders.coronaFragment)
  })

  it('declares every uniform the Sun component sets', () => {
    const uses = {
      sunPhotosphereFragment: ['uTime', 'uIntensity', 'uGranuleScale', 'uDeep', 'uMid', 'uHot', 'uCore'],
      chromosphereFragment: ['uColor', 'uStrength', 'uLimb', 'uTime'],
      prominenceFragment: ['uColor', 'uTime', 'uStarFraction', 'uStrength', 'uSeed'],
    }
    for (const [name, uniforms] of Object.entries(uses)) {
      for (const u of uniforms) expect(sunShaders[name], `${name}.${u}`).toMatch(new RegExp(`uniform \\w+ ${u};`))
    }
  })

  it('fades granulation below pixel size and applies its own exposure curve', () => {
    expect(sunShaders.sunPhotosphereFragment).toContain('fwidth(p)')
    expect(sunShaders.sunPhotosphereFragment).toContain('1.0) - exp(-col * uIntensity)')
    expect(sunShaders.sunPhotosphereFragment).not.toContain('#include <tonemapping_fragment>')
  })
})

describe('Sun component and viewport', () => {
  const sun = readFileSync(path.join(here, 'Sun.jsx'), 'utf8')
  const viewport = readFileSync(path.resolve(here, '../viewports/SunViewport.jsx'), 'utf8')

  it('leaves the host-star component alone', () => {
    expect(sun).not.toMatch(/from '\.\.\/star\/Star\.jsx'/)
  })

  it('labels the Sun as an artistic impression with stylised colours', () => {
    expect(viewport).toContain('Artistic impression')
    expect(viewport).toContain('Our Sun')
    expect(viewport).toMatch(/Colours stylised: the Sun’s true colour is close to white/)
  })

  it('uses the shared error boundary, quality tiers and frame-rate fallback', () => {
    expect(viewport).toContain('CanvasErrorBoundary')
    expect(viewport).toContain('PerformanceMonitor')
    expect(viewport).toContain("setAutoKey('low')")
  })

  it('freezes time for reduced motion', () => {
    expect(sun).toMatch(/animate \? STILL_TIME \+ state\.clock\.elapsedTime : STILL_TIME/)
  })
})
