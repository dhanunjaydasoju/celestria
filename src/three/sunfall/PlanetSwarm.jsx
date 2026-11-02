// SUNFALL planet copies and arrival flashes — owner: LEAD (Stage S3).
// One instanced draw call for every copy and one Points draw call for the
// flashes, both animated on the GPU from a shared time ref.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import { createSurfaceMaterial } from '../planet/surfaceMaterial.js'
import { starLightRGB } from '../star/starColor.js'
import { flashFragment, flashVertex, swarmVertex } from './shaders.js'

const SUN_TEFF_K = 5772 // IAU 2015 nominal; copies are lit by our Sun, not their host star

/**
 * @param {{ params: ReturnType<typeof import('../planet/visualParams.js').visualParams>,
 *           paths: ReturnType<typeof import('./trajectories.js').buildTrajectories>,
 *           count: number, scale: number, subdivisions: number, octaves: number,
 *           timeRef: { current: number } }} props
 */
export function PlanetSwarm({ params, paths, count, scale, subdivisions, octaves, timeRef }) {
  const geometry = useMemo(() => {
    const base = new IcosahedronGeometry(1, subdivisions)
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('normal', base.getAttribute('normal'))
    g.setAttribute('aStart', new InstancedBufferAttribute(paths.start, 3))
    g.setAttribute('aCtrl', new InstancedBufferAttribute(paths.ctrl, 3))
    g.setAttribute('aEnd', new InstancedBufferAttribute(paths.end, 3))
    g.setAttribute('aTime', new InstancedBufferAttribute(paths.time, 2))
    g.setAttribute('aSpin', new InstancedBufferAttribute(paths.spin, 3))
    g.instanceCount = count
    return g
  }, [paths, count, subdivisions])

  const material = useMemo(() => {
    const surface = createSurfaceMaterial(params, octaves)
    const m = new ShaderMaterial({
      vertexShader: swarmVertex,
      fragmentShader: surface.fragmentShader,
      defines: surface.defines,
      uniforms: { ...surface.uniforms, uScale: { value: scale } },
    })
    m.uniforms.uLightPos.value = [0, 0, 0]
    // A little ambient light so night sides facing the camera keep a hint of the planet's colours.
    m.uniforms.uAmbient.value = 0.12
    m.uniforms.uLightColor.value = new Color().setRGB(...starLightRGB(SUN_TEFF_K).rgb, SRGBColorSpace)
    surface.dispose()
    return m
  }, [params, octaves, scale])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  const mesh = useRef()
  useFrame(() => {
    if (mesh.current) mesh.current.material.uniforms.uTime.value = timeRef.current
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}

/** Brief flare where each copy enters the Sun. */
export function ArrivalFlashes({ paths, count, size, timeRef }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const arrive = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Slightly above the entry point so the flare sits on the surface.
      pos[i * 3] = paths.end[i * 3] * 1.03
      pos[i * 3 + 1] = paths.end[i * 3 + 1] * 1.03
      pos[i * 3 + 2] = paths.end[i * 3 + 2] * 1.03
      arrive[i] = paths.time[i * 2 + 1]
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aArrive', new BufferAttribute(arrive, 1))
    return g
  }, [paths, count])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: flashVertex,
        fragmentShader: flashFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: size },
          uPixelRatio: { value: 1 },
          uColor: { value: new Color(1, 0.82, 0.55) },
        },
      }),
    [size],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  const points = useRef()
  useFrame((state) => {
    if (!points.current) return
    const u = points.current.material.uniforms
    u.uTime.value = timeRef.current
    u.uPixelRatio.value = state.gl.getPixelRatio() * state.size.height * 0.5
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
