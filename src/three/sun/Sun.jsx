// SUNFALL Sun — owner: LEAD (Stage S2). Independent of the host-star
// component (star/Star.jsx), which is unchanged. Plain props only.
//
// Layers, inside out (sizes in SUN_LAYERS):
//   photosphere   sphere: granulation, faculae, spots, limb darkening
//   chromosphere  back-face shell: thin bright rim just outside the limb
//   prominences   camera-facing disc: a few arcs off the limb (optional)
//   corona        camera-facing disc (existing star corona shader)
//   halo          wide, faint camera-facing disc (same shader)
// The camera-facing discs pass through the Sun's centre, so the photosphere
// hides the parts behind the disc and only the off-limb glow shows.

import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Color, ShaderMaterial, SRGBColorSpace } from 'three'
import { SUN_LAYERS, SUN_PALETTE, limbDot } from './quality.js'
import { chromosphereFragment, coronaFragment, coronaVertex, prominenceFragment, sunPhotosphereFragment, sunVertex } from './shaders.js'

/** Fixed time for reduced motion: a settled, representative frame. */
const STILL_TIME = 120

const glowMaterial = (opts) =>
  new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, ...opts })

/**
 * @param {Object} props
 * @param {number} [props.radius=1]          scene units
 * @param {ReturnType<typeof import('./quality.js').sunTier>} props.tier
 * @param {boolean} [props.animate=true]     false: frozen frame (reduced motion)
 * @param {number} [props.intensity=1.9]     photosphere exposure
 * @param {{ prominences?: boolean, corona?: boolean, chromosphere?: boolean }} [props.layers]  lab toggles
 */
export default function Sun({ radius = 1, tier, animate = true, intensity = 1.9, layers = {} }) {
  const show = { prominences: tier.prominences, corona: true, chromosphere: true, ...layers }
  const defines = useMemo(() => ({ OCTAVES: tier.octaves }), [tier.octaves])

  const photosphere = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: sunVertex,
        fragmentShader: sunPhotosphereFragment,
        defines,
        toneMapped: false,
        uniforms: {
          uTime: { value: STILL_TIME },
          uIntensity: { value: intensity },
          uGranuleScale: { value: tier.granuleScale },
          uDeep: { value: new Color(SUN_PALETTE.deep) },
          uMid: { value: new Color(SUN_PALETTE.mid) },
          uHot: { value: new Color(SUN_PALETTE.hot) },
          uCore: { value: new Color(SUN_PALETTE.core) },
        },
      }),
    [defines, intensity, tier.granuleScale],
  )
  const chromosphere = useMemo(
    () =>
      glowMaterial({
        vertexShader: sunVertex,
        fragmentShader: chromosphereFragment,
        side: BackSide,
        defines,
        uniforms: {
          uColor: { value: new Color(SUN_PALETTE.chromosphere) },
          uStrength: { value: 2.2 },
          uLimb: { value: limbDot(SUN_LAYERS.chromosphere) },
          uTime: { value: STILL_TIME },
        },
      }),
    [defines],
  )
  const prominences = useMemo(
    () =>
      glowMaterial({
        vertexShader: coronaVertex,
        fragmentShader: prominenceFragment,
        defines,
        uniforms: {
          uColor: { value: new Color(SUN_PALETTE.prominence) },
          uTime: { value: STILL_TIME },
          uStarFraction: { value: 1 / SUN_LAYERS.prominence },
          uStrength: { value: 1.8 },
          uSeed: { value: 3.7 },
        },
      }),
    [defines],
  )
  const corona = useMemo(() => coronaMaterial(SUN_LAYERS.coronaInner, 0.5, defines), [defines])
  const halo = useMemo(() => coronaMaterial(SUN_LAYERS.coronaOuter, 0.32, defines), [defines])

  useEffect(() => () => photosphere.dispose(), [photosphere])
  useEffect(() => () => chromosphere.dispose(), [chromosphere])
  useEffect(() => () => prominences.dispose(), [prominences])
  useEffect(() => () => corona.dispose(), [corona])
  useEffect(() => () => halo.dispose(), [halo])

  // Time-driven uniforms are updated through refs (materials are memoised).
  const surfaceRef = useRef()
  const chromoRef = useRef()
  const promRef = useRef()
  const coronaRef = useRef()
  const haloRef = useRef()
  useFrame((state) => {
    const t = animate ? STILL_TIME + state.clock.elapsedTime : STILL_TIME
    for (const mesh of [surfaceRef.current, chromoRef.current, promRef.current, coronaRef.current, haloRef.current]) {
      const u = mesh?.material.uniforms.uTime
      if (u) u.value = t
    }
    if (animate && surfaceRef.current) surfaceRef.current.rotation.y = t * 0.004
  })

  const s = (k) => radius * k * 2 // half-size → plane size
  return (
    <group>
      <mesh ref={surfaceRef} material={photosphere} scale={radius}>
        <sphereGeometry args={[1, tier.segments, Math.round(tier.segments * 0.75)]} />
      </mesh>
      {show.chromosphere && (
        <mesh ref={chromoRef} material={chromosphere} scale={radius * SUN_LAYERS.chromosphere} raycast={() => null}>
          <sphereGeometry args={[1, tier.segments, Math.round(tier.segments * 0.75)]} />
        </mesh>
      )}
      <Billboard>
        {show.corona && (
          <>
            <mesh ref={haloRef} material={halo} scale={s(SUN_LAYERS.coronaOuter)} raycast={() => null} renderOrder={-2}>
              <planeGeometry args={[1, 1]} />
            </mesh>
            <mesh ref={coronaRef} material={corona} scale={s(SUN_LAYERS.coronaInner)} raycast={() => null} renderOrder={-1}>
              <planeGeometry args={[1, 1]} />
            </mesh>
          </>
        )}
        {show.prominences && (
          <mesh ref={promRef} material={prominences} scale={s(SUN_LAYERS.prominence)} raycast={() => null}>
            <planeGeometry args={[1, 1]} />
          </mesh>
        )}
      </Billboard>
    </group>
  )
}

function coronaMaterial(halfSize, strength, defines) {
  return glowMaterial({
    vertexShader: coronaVertex,
    fragmentShader: coronaFragment,
    defines,
    uniforms: {
      uColor: { value: new Color().setRGB(...SUN_PALETTE.corona, SRGBColorSpace) },
      uTime: { value: STILL_TIME },
      uSeed: { value: 1.3 },
      uStarFraction: { value: 1 / halfSize },
      uStrength: { value: strength },
    },
  })
}
