// SUNFALL swarm materials — owner: LEAD (Stage S3.1). The planet's own
// Planet Viewport materials (visualParams → planet/surfaceMaterial.js), with
// the instanced swarm vertex shader and the key-light mix. No separate
// classification: whatever look Planet Viewport gives a planet, its copies get.

import { AdditiveBlending, BackSide, ShaderMaterial, Vector3 } from 'three'
import { PLANET_KEY_LIGHT } from '../planet/keyLight.js'
import { atmosphereShellScale, createAtmosphereMaterial, createSurfaceMaterial } from '../planet/surfaceMaterial.js'
import { swarmVertex, withKeyLight } from './shaders.js'

/** Share of the key light in the copies' lighting; the rest comes from the Sun at the centre. */
export const KEY_LIGHT_MIX = 0.75
const KEY_DIR = new Vector3(...PLANET_KEY_LIGHT).normalize()

/** Swarm version of a planet material: instanced vertex shader, key-lit fragment. */
export function swarmMaterial(base, { scale, shell, extra = {} }) {
  const m = new ShaderMaterial({
    vertexShader: swarmVertex,
    fragmentShader: withKeyLight(base.fragmentShader),
    defines: base.defines,
    uniforms: {
      ...base.uniforms,
      uTime: base.uniforms.uTime ?? { value: 0 },
      uScale: { value: scale },
      uShell: { value: shell },
      uKeyDir: { value: KEY_DIR.clone() },
      uKeyMix: { value: KEY_LIGHT_MIX },
    },
    ...extra,
  })
  m.uniforms.uLightPos.value = [0, 0, 0] // the Sun
  base.dispose()
  return m
}

/**
 * Surface (and, when the look has one, atmosphere shell) materials for the
 * copies of a planet.
 * @param {ReturnType<typeof import('../planet/visualParams.js').visualParams>} params
 * @param {{ octaves: number, scale: number }} opts
 */
export function swarmMaterials(params, { octaves, scale }) {
  const surface = swarmMaterial(createSurfaceMaterial(params, octaves), { scale, shell: 1 })
  const shell = atmosphereShellScale(params)
  const atmosphere = params.atmosphere
    ? swarmMaterial(createAtmosphereMaterial(params, shell), {
        scale,
        shell,
        extra: { side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending },
      })
    : null
  return { surface, atmosphere }
}
