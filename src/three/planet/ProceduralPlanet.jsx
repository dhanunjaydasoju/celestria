// Reusable procedural planet — owner: LEAD.
//
// Scene-level building block used by every viewport (planet, system, size
// comparison, hero). Takes plain props; never reads the store. The planet is
// a unit sphere scaled by `radius`; all appearance comes from visualParams().

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Color, IcosahedronGeometry, ShaderMaterial, SRGBColorSpace } from 'three'
import { atmosphereFragment, atmosphereVertex } from './shaders/atmosphere.js'
import { createSurfaceMaterial } from './surfaceMaterial.js'
import { visualParams } from './visualParams.js'

const DETAIL = {
  hero: { subdivisions: 48, octaves: 6 },
  card: { subdivisions: 20, octaves: 4 },
  system: { subdivisions: 24, octaves: 5 },
}

// Shared across all planets of the same detail level; never disposed.
const geometryCache = new Map()
function sharedGeometry(subdivisions) {
  if (!geometryCache.has(subdivisions)) geometryCache.set(subdivisions, new IcosahedronGeometry(1, subdivisions))
  return geometryCache.get(subdivisions)
}

const srgb = (hex) => new Color(hex)
const lightColor = ([r, g, b]) => new Color().setRGB(r, g, b, SRGBColorSpace)

function createAtmosphereMaterial(params, shellScale) {
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

/**
 * @param {Object} props
 * @param {import('../../contracts/planet.js').Planet} [props.planet]
 * @param {ReturnType<typeof visualParams>} [props.params]  pass when already computed
 * @param {'hero'|'card'|'system'} [props.detail='hero']
 * @param {number} [props.radius=1]               scene units
 * @param {[number, number, number]} [props.position]
 * @param {[number, number, number]} props.lightPosition  world-space position of the star
 * @param {boolean} [props.spin=true]
 * @param {number} [props.spinSpeed=0.06]         rad/s, artistic
 * @param {(e: any) => void} [props.onClick]
 */
export default function ProceduralPlanet({
  planet,
  params: paramsProp,
  detail = 'hero',
  radius = 1,
  position = [0, 0, 0],
  lightPosition,
  spin = true,
  spinSpeed = 0.06,
  onClick,
  ...groupProps
}) {
  const params = useMemo(() => paramsProp ?? visualParams(planet), [paramsProp, planet])
  const { subdivisions, octaves } = DETAIL[detail] ?? DETAIL.hero
  const geometry = sharedGeometry(subdivisions)
  const shellScale = params.atmosphere ? 1 + params.atmosphere.thickness * 2.6 : 1

  const surface = useMemo(() => createSurfaceMaterial(params, octaves), [params, octaves])
  const atmosphere = useMemo(
    () => (params.atmosphere ? createAtmosphereMaterial(params, shellScale) : null),
    [params, shellScale],
  )
  useEffect(() => () => surface.dispose(), [surface])
  useEffect(() => () => atmosphere?.dispose(), [atmosphere])

  // Per-frame uniform updates go through mesh refs: materials are memoized
  // values and must not be mutated directly from render scope.
  const surfaceMesh = useRef()
  const atmosphereMesh = useRef()
  const spinRef = useRef()

  useEffect(() => {
    surfaceMesh.current.material.uniforms.uLightPos.value = lightPosition
    if (atmosphereMesh.current) atmosphereMesh.current.material.uniforms.uLightPos.value = lightPosition
  }, [surface, atmosphere, lightPosition])

  // Artistic axial tilt (real obliquities are unknown), fixed per planet.
  const tilt = (params.seed - 0.5) * 0.6

  useFrame((state, delta) => {
    surfaceMesh.current.material.uniforms.uTime.value = state.clock.elapsedTime
    if (spin) spinRef.current.rotation.y += delta * spinSpeed
  })

  return (
    <group position={position} {...groupProps}>
      <group rotation={[0, 0, tilt]} scale={radius}>
        <group ref={spinRef}>
          <mesh ref={surfaceMesh} geometry={geometry} material={surface} onClick={onClick} dispose={null} />
        </group>
        {atmosphere && (
          <mesh
            ref={atmosphereMesh}
            geometry={geometry}
            material={atmosphere}
            scale={shellScale}
            raycast={() => null}
            dispose={null}
          />
        )}
      </group>
    </group>
  )
}
