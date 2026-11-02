import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { SUNFALL_LAB_PLANETS } from '../lab/sunfallLabPlanets.js'
import { PLANET_KEY_LIGHT } from '../planet/keyLight.js'
import { atmosphereFragment } from '../planet/shaders/atmosphere.js'
import { surfaceFragment } from '../planet/shaders/surface.js'
import { atmosphereShellScale, createSurfaceMaterial } from '../planet/surfaceMaterial.js'
import { visualParams } from '../planet/visualParams.js'
import { COMPACT_WIDTH, SUN_SCENE_RADIUS, flashWorldSize, heroInsetLayout } from './camera.js'
import { KEY_LIGHT_MIX, swarmMaterials } from './materials.js'
import { withKeyLight } from './shaders.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const byId = Object.fromEntries(SUNFALL_LAB_PLANETS.map((p) => [p.id, p]))

// One planet per look the project's classification produces.
const CASES = {
  rocky: 'trappist-1-e',
  gasGiant: 'kepler-16-b',
  iceGiant: '55-cnc-f', //          Neptune-like, cool blue palette
  lava: 'kepler-10-b', //           scorching rocky world with glowing cracks
  incomplete: 'synthetic-no-temperature', // radius only: temperature band unknown
}

const APPEARANCE_UNIFORMS = ['uType', 'uSeed', 'uColorLow', 'uColorMid', 'uColorHigh', 'uGlowColor', 'uGlow', 'uIce', 'uBandFreq', 'uBandContrast', 'uTurbulence', 'uNoiseScale', 'uWrap', 'uLightColor']
const value = (u) => (u.value?.isColor ? u.value.getHexString() : u.value)

describe('swarm copies use the planet’s own Planet Viewport look', () => {
  for (const [label, id] of Object.entries(CASES)) {
    it(`${label}: every appearance uniform equals the Planet Viewport material`, () => {
      const params = visualParams(byId[id])
      const viewport = createSurfaceMaterial(params, 4)
      const { surface } = swarmMaterials(params, { octaves: 4, scale: 1 })
      for (const k of APPEARANCE_UNIFORMS) expect(value(surface.uniforms[k]), `${id} ${k}`).toEqual(value(viewport.uniforms[k]))
      expect(surface.defines).toEqual(viewport.defines)
    })
  }

  it('gives different classifications visibly different looks', () => {
    const looks = Object.values(CASES).map((id) => {
      const u = swarmMaterials(visualParams(byId[id]), { octaves: 4, scale: 1 }).surface.uniforms
      return `${u.uType.value}|${value(u.uColorMid)}|${u.uGlow.value > 0}`
    })
    expect(new Set(looks).size).toBe(looks.length)
    const lava = swarmMaterials(visualParams(byId[CASES.lava]), { octaves: 4, scale: 1 }).surface.uniforms
    expect(lava.uGlow.value).toBeGreaterThan(0.5) // glowing surface kept
    const giant = swarmMaterials(visualParams(byId[CASES.gasGiant]), { octaves: 4, scale: 1 }).surface.uniforms
    expect(giant.uType.value).toBe(4) // banded giant shader branch
    expect(swarmMaterials(visualParams(byId[CASES.rocky]), { octaves: 4, scale: 1 }).surface.uniforms.uType.value).toBe(1)
  })

  it('is deterministic: the same planet always gets the same pattern seed', () => {
    const a = swarmMaterials(visualParams(byId[CASES.rocky]), { octaves: 4, scale: 1 }).surface.uniforms.uSeed.value
    const b = swarmMaterials(visualParams(byId[CASES.rocky]), { octaves: 2, scale: 3 }).surface.uniforms.uSeed.value
    expect(a).toBe(b)
  })

  it('adds the atmosphere shell exactly when the Planet Viewport look has one', () => {
    for (const id of Object.values(CASES)) {
      const params = visualParams(byId[id])
      const { atmosphere } = swarmMaterials(params, { octaves: 3, scale: 1 })
      expect(Boolean(atmosphere), id).toBe(Boolean(params.atmosphere))
      if (atmosphere) expect(atmosphere.uniforms.uShell.value).toBe(atmosphereShellScale(params))
    }
  })

  it('lights copies mainly from the Planet Viewport key direction, with the Sun at the centre', () => {
    const { surface } = swarmMaterials(visualParams(byId[CASES.rocky]), { octaves: 4, scale: 1 })
    expect(surface.uniforms.uKeyDir.value.toArray()).toEqual(new Vector3(...PLANET_KEY_LIGHT).normalize().toArray())
    expect(surface.uniforms.uKeyMix.value).toBe(KEY_LIGHT_MIX)
    expect(KEY_LIGHT_MIX).toBeGreaterThan(0.5)
    expect(surface.uniforms.uLightPos.value).toEqual([0, 0, 0])
  })
})

describe('withKeyLight', () => {
  it('patches copies of the surface and atmosphere shaders, leaving the originals unchanged', () => {
    for (const src of [surfaceFragment, atmosphereFragment]) {
      const patched = withKeyLight(src)
      expect(patched).toContain('uniform vec3 uKeyDir;')
      expect(patched).toContain('mix(normalize(uLightPos - vWorldPos), uKeyDir, uKeyMix)')
      expect(src).toContain('vec3 L = normalize(uLightPos - vWorldPos);')
      expect(src).not.toContain('uKeyDir')
    }
  })

  it('fails loudly if the planet shader changes shape', () => {
    expect(() => withKeyLight('void main() {}')).toThrow(/light direction line not found/)
  })
})

describe('Planet Viewport is unchanged', () => {
  it('still lights from the same key position, now shared', () => {
    expect(PLANET_KEY_LIGHT).toEqual([-10, 3, 3.5])
    const src = readFileSync(path.resolve(here, '../viewports/PlanetViewport.jsx'), 'utf8')
    expect(src).toContain('const LIGHT_POSITION = PLANET_KEY_LIGHT')
  })

  it('ProceduralPlanet builds its materials from the shared module, with the same shell size', () => {
    const src = readFileSync(path.resolve(here, '../planet/ProceduralPlanet.jsx'), 'utf8')
    expect(src).toContain("from './surfaceMaterial.js'")
    expect(src).toContain('atmosphereShellScale(params)')
    const params = visualParams(byId[CASES.iceGiant])
    expect(atmosphereShellScale(params)).toBe(params.atmosphere ? 1 + params.atmosphere.thickness * 2.6 : 1)
  })
})

describe('hero inset and flashes', () => {
  it('places the enlarged copy in a corner that stays on screen', () => {
    const desk = heroInsetLayout(1280, 800)
    expect(desk).toMatchObject({ compact: false, radius: 48 })
    expect(desk.center[0] - desk.radius).toBeGreaterThan(0)
    expect(desk.center[1] - desk.radius).toBeGreaterThan(0)
    const phone = heroInsetLayout(375, 700)
    expect(phone.compact).toBe(true)
    expect(phone.radius).toBeLessThan(desk.radius)
    const short = heroInsetLayout(COMPACT_WIDTH - 1, 120)
    expect(short.center[1] + short.radius).toBeLessThanOrEqual(120)
  })

  it('caps arrival flashes so giant copies do not flood the Sun with glare', () => {
    expect(flashWorldSize(0.05)).toBeCloseTo(SUN_SCENE_RADIUS * 0.03, 10)
    expect(flashWorldSize(0.2)).toBeCloseTo(0.5, 10)
    expect(flashWorldSize(2)).toBe(SUN_SCENE_RADIUS * 0.06)
  })
})

describe('labels', () => {
  it('captions the hero inset as enlarged, with copies to scale', () => {
    const src = readFileSync(path.resolve(here, '../viewports/SunfallViewport.jsx'), 'utf8')
    expect(src).toContain('Enlarged here; the copies in the scene are to scale')
    expect(src).toContain('(enlarged)')
  })
})
