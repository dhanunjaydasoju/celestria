// Host star — owner: LEAD. Photosphere sphere + camera-facing corona disc.
// Colour from Teff (blackbody); size from scale.js. Plain props only.

import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, ShaderMaterial, SRGBColorSpace } from 'three'
import { coronaFragment, coronaVertex, photosphereFragment, photosphereVertex } from './shaders.js'

const CORONA_SCALE = 3.2 // corona disc half-size / star radius

/**
 * @param {{ radius: number, color: [number, number, number], seed?: number, onClick?: (e: any) => void }} props
 */
export default function Star({ radius, color, seed = 0, onClick }) {
  const surface = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: photosphereVertex,
        fragmentShader: photosphereFragment,
        defines: { OCTAVES: 5 },
        uniforms: {
          uColor: { value: new Color().setRGB(...color, SRGBColorSpace) },
          uTime: { value: 0 },
          uSeed: { value: seed },
          uIntensity: { value: 1.85 },
        },
      }),
    [color, seed],
  )
  const corona = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: coronaVertex,
        fragmentShader: coronaFragment,
        defines: { OCTAVES: 3 },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uColor: { value: new Color().setRGB(...color, SRGBColorSpace) },
          uTime: { value: 0 },
          uSeed: { value: seed },
          uStarFraction: { value: 1 / CORONA_SCALE },
          uStrength: { value: 0.85 },
        },
      }),
    [color, seed],
  )
  useEffect(() => () => surface.dispose(), [surface])
  useEffect(() => () => corona.dispose(), [corona])

  const surfaceMesh = useRef()
  const coronaMesh = useRef()
  useFrame((state) => {
    const t = state.clock.elapsedTime
    surfaceMesh.current.material.uniforms.uTime.value = t
    coronaMesh.current.material.uniforms.uTime.value = t
    surfaceMesh.current.rotation.y = t * 0.01
  })

  return (
    <group>
      <mesh ref={surfaceMesh} material={surface} scale={radius} onClick={onClick}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
      <Billboard>
        <mesh ref={coronaMesh} material={corona} scale={radius * CORONA_SCALE * 2} raycast={() => null} renderOrder={-1}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </Billboard>
    </group>
  )
}
