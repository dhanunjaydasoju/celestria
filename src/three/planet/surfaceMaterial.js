// Procedural planet surface material — owner: LEAD. Shared by
// ProceduralPlanet and the SUNFALL swarm, so copies look exactly like the
// planet's impression.

import { Color, ShaderMaterial, SRGBColorSpace } from 'three'
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
