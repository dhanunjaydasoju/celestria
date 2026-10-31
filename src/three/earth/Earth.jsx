// Realistic Earth for the homepage — owner: LEAD.
//
// NASA imagery (public/textures/earth/CREDITS.md) on a sphere whose UVs map
// longitude 0 to +X. Loads small preview textures first (Suspense), then
// swaps in the tier's full-resolution set in the background. The globe is
// turned about its axis so the real subsolar point faces the scene's Sun.

import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Euler, Matrix4, NoColorSpace, RepeatWrapping, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from 'three'
import { PREVIEW_TEXTURES, TEXTURE_BASE } from './quality.js'
import { atmosphereVertex, cloudsFragment, glowFragment, globeVertex, scatteringFragment, surfaceFragment } from './shaders.js'

const CLOUD_RADIUS = 1.006
const ATMOSPHERE_RADIUS = 1.03
const GLOW_RADIUS = 1.07
const urls = (set) => [TEXTURE_BASE + set.day, TEXTURE_BASE + set.night, TEXTURE_BASE + set.clouds]

function prepare([day, night, clouds], anisotropy) {
  day.colorSpace = SRGBColorSpace
  night.colorSpace = SRGBColorSpace
  clouds.colorSpace = NoColorSpace // used as data (coverage)
  clouds.wrapS = RepeatWrapping
  for (const t of [day, night, clouds]) {
    t.anisotropy = anisotropy
    t.needsUpdate = true
  }
  return { day, night, clouds }
}

const sunObj = new Vector3()
const inv = new Matrix4()

/**
 * @param {Object} props
 * @param {typeof import('./quality.js').TIERS.high} props.tier
 * @param {[number, number, number]} props.sunDir   world-space unit vector towards the Sun
 * @param {Euler} props.tilt                         orientation of Earth's axis in the scene
 * @param {number} props.yaw                         rotation about the axis (radians)
 * @param {[number, number, number]} [props.position]
 * @param {boolean} [props.animate=true]             cloud drift
 * @param {() => void} [props.onFullResolution]
 */
export default function Earth({ tier, sunDir, tilt, yaw, position = [0, 0, 0], animate = true, onFullResolution }) {
  const gl = useThree((s) => s.gl)
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
  const preview = useTexture(urls(PREVIEW_TEXTURES))
  const textures = useMemo(() => prepare(preview, anisotropy), [preview, anisotropy])

  const globeGeo = useMemo(() => new SphereGeometry(1, tier.segments, tier.segments / 2), [tier.segments])
  const shellGeo = useMemo(() => new SphereGeometry(1, 96, 48), [])
  useEffect(() => () => globeGeo.dispose(), [globeGeo])
  useEffect(() => () => shellGeo.dispose(), [shellGeo])

  const materials = useMemo(() => {
    const sun = new Vector3(...sunDir)
    const surface = new ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: surfaceFragment,
      uniforms: {
        uDay: { value: textures.day },
        uNight: { value: textures.night },
        uClouds: { value: textures.clouds },
        uSunDir: { value: sun.clone() },
        uSunObj: { value: new Vector3() },
        uCloudOffset: { value: 0 },
        uCloudShadow: { value: tier.cloudShadows ? 1 : 0 },
        uHaze: { value: tier.scattering ? 0.18 : 0.42 },
      },
    })
    const clouds = new ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: cloudsFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uClouds: { value: textures.clouds }, uSunDir: { value: sun.clone() }, uCloudOffset: { value: 0 } },
    })
    const atmosphere = tier.scattering
      ? new ShaderMaterial({
          vertexShader: atmosphereVertex,
          fragmentShader: scatteringFragment,
          side: BackSide,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          uniforms: { uCenter: { value: new Vector3(...position) }, uRp: { value: 1 }, uRa: { value: ATMOSPHERE_RADIUS }, uSunDir: { value: sun.clone() }, uSunIntensity: { value: 22 } },
        })
      : new ShaderMaterial({
          vertexShader: atmosphereVertex,
          fragmentShader: glowFragment,
          side: BackSide,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          uniforms: { uSunDir: { value: sun.clone() }, uLimb: { value: Math.sqrt(1 - 1 / (GLOW_RADIUS * GLOW_RADIUS)) } },
        })
    return { surface, clouds, atmosphere }
    // Sun, position and textures are pushed into uniforms below without rebuilding.
  }, [tier]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const surfaceRef = useRef()
  const cloudsRef = useRef()
  const atmosphereRef = useRef()
  const spinRef = useRef()

  // Full-resolution textures, loaded after the preview is on screen.
  useEffect(() => {
    let cancelled = false
    const loader = new TextureLoader()
    Promise.all(urls(tier.textures).map((u) => loader.loadAsync(u)))
      .then((loaded) => {
        if (cancelled) return loaded.forEach((t) => t.dispose())
        const full = prepare(loaded, anisotropy)
        const s = surfaceRef.current?.material
        const c = cloudsRef.current?.material
        if (!s || !c) return
        s.uniforms.uDay.value = full.day
        s.uniforms.uNight.value = full.night
        s.uniforms.uClouds.value = full.clouds
        c.uniforms.uClouds.value = full.clouds
        onFullResolution?.()
      })
      .catch(() => {
        /* keep the preview textures */
      })
    return () => {
      cancelled = true
    }
  }, [tier, anisotropy]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sun direction and position into uniforms (through refs: materials are memoized values).
  useEffect(() => {
    for (const r of [surfaceRef, cloudsRef, atmosphereRef]) r.current?.material.uniforms.uSunDir.value.set(...sunDir)
    atmosphereRef.current?.material.uniforms.uCenter?.value.set(...position)
  }, [sunDir, position, materials])

  useFrame((_, delta) => {
    const s = surfaceRef.current
    if (!s) return
    if (animate) {
      // Artistic cloud drift (the cloud layer is a fixed 2002 composite, not live weather).
      const off = s.material.uniforms.uCloudOffset.value + delta * 0.0022
      s.material.uniforms.uCloudOffset.value = off
      cloudsRef.current.material.uniforms.uCloudOffset.value = off
    }
    // Sun in the globe's object space, for cloud-shadow offsets.
    inv.copy(spinRef.current.matrixWorld).invert()
    sunObj.set(...sunDir).transformDirection(inv)
    s.material.uniforms.uSunObj.value.copy(sunObj)
  })

  return (
    <group position={position}>
      <group rotation={tilt}>
        <group ref={spinRef} rotation={[0, yaw, 0]}>
          <mesh ref={surfaceRef} geometry={globeGeo} material={materials.surface} />
          <mesh ref={cloudsRef} geometry={shellGeo} material={materials.clouds} scale={CLOUD_RADIUS} />
        </group>
      </group>
      <mesh ref={atmosphereRef} geometry={shellGeo} material={materials.atmosphere} scale={tier.scattering ? ATMOSPHERE_RADIUS : GLOW_RADIUS} />
    </group>
  )
}
