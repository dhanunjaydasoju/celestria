// Procedural planet materials (surface and atmosphere shell) — owner: LEAD.
// Shared by ProceduralPlanet and the SUNFALL swarm, so copies look like the
// planet's impression in Planet Viewport.

import { AdditiveBlending, BackSide, Color, ShaderMaterial, SRGBColorSpace } from 'three'
import { atmosphereFragment, atmosphereVertex } from './shaders/atmosphere.js'
import { surfaceFragment, surfaceVertex } from './shaders/surface.js'

const srgb = (hex) => new Color(hex)
const lightColor = ([r, g, b]) => new Color().setRGB(r, g, b, SRGBColorSpace)

/** Surface material for a planet's look (visualParams). */
export function createSurfaceMaterial(params, octaves) {
  const s = params.surface
  return new ShaderMaterial({
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    defines: { OCTAVES: octaves },
    uniforms: {
      uType: { value: s.type },
      uSeed: { value: s.seed },
      uColorLow: { value: srgb(s.colors[0]) },
      uColorMid: { value: srgb(s.colors[1]) },
      uColorHigh: { value: srgb(s.colors[2]) },
      uGlowColor: { value: srgb(s.glowColor) },
      uGlow: { value: s.glow },
      uIce: { value: s.ice },
      uBandFreq: { value: s.bandFreq },
      uBandContrast: { value: s.bandContrast },
      uTurbulence: { value: s.turbulence },
      uNoiseScale: { value: s.noiseScale },
      uWrap: { value: s.wrap },
      uLightPos: { value: [0, 0, 0] },
      uLightColor: { value: lightColor(params.light.rgb) },
      uLightIntensity: { value: 1.55 },
      uAmbient: { value: 0.035 },
      uTime: { value: 0 },
    },
  })
}

/** Atmosphere shell size relative to the planet (1 when it has none). */
export function atmosphereShellScale(params) {
  return params.atmosphere ? 1 + params.atmosphere.thickness * 2.6 : 1
}

/** Fresnel atmosphere shell (back faces, additive). */
export function createAtmosphereMaterial(params, shellScale) {
  const a = params.atmosphere
  return new ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: srgb(a.color) },
      uLightPos: { value: [0, 0, 0] },
      uLightColor: { value: lightColor(params.light.rgb) },
      uStrength: { value: a.strength },
      uLimb: { value: Math.sqrt(1 - 1 / (shellScale * shellScale)) },
    },
  })
}
