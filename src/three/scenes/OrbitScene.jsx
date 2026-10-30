// Orbital Simulator scene — owner: LEAD (M3).
//
// One star at the ellipse's focus, one planet, its orbit. Orbit shape and
// distances are to scale (scene units = AU × scale); the star is drawn to
// scale when that is visible, otherwise enlarged; the planet is always
// enlarged. Every position comes from kepler.js at the clock's time, so the
// timeline and playback show the same physics.

import { Line, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, Vector3 } from 'three'
import { orbitExtremes, orbitState, solveKepler, trueFromEccentric, transitPhase } from '../../science/kepler.js'
import { orbitLayout, toScene } from '../system/orbitLayout.js'
import FitCamera from '../camera/FitCamera.jsx'
import ProceduralPlanet from '../planet/ProceduralPlanet.jsx'
import { LabelProjector } from '../shared/ScreenLabels.jsx'
import Starfield from '../shared/Starfield.jsx'
import Star from '../star/Star.jsx'

const ORIGIN = [0, 0, 0]
const ORBIT_SEGMENTS = 720
const TRAIL_POINTS = 90
const SLOW = new Color('#7fc4dc') // orbit colour where the planet is slowest
const FAST = new Color('#ffc98a') // … and fastest

const X_AXIS = new Vector3(1, 0, 0)
const ZERO = new Vector3()
const v3 = new Vector3()
const dir = new Vector3()

/**
 * @param {Object} props
 * @param {ReturnType<typeof import('../../science/kepler.js').orbitalElements>} props.el
 * @param {ReturnType<typeof import('../planet/visualParams.js').visualParams>} props.planetParams
 * @param {{ color: [number, number, number], seed: number }} props.star
 * @param {{ step: (dt: number) => number, direction: () => 1|-1 }} props.clock
 *   step advances the simulation (when playing) and returns its time
 * @param {{ current: Map<string, HTMLElement> }} props.labelRefs
 */
export default function OrbitScene({ el, planetParams, star, clock, labelRefs }) {
  const layout = useMemo(() => orbitLayout(el), [el])
  const ext = useMemo(() => orbitExtremes(el), [el])
  const s = layout.scale

  // Orbit path sampled uniformly in eccentric anomaly (dense near periastron
  // for eccentric orbits), coloured by speed: v ∝ √(2/r − 1/a).
  const { points, colors } = useMemo(() => {
    const pts = []
    const cols = []
    const vMin = Math.sqrt(2 / (el.a * (1 + el.e)) - 1 / el.a)
    const vMax = Math.sqrt(2 / (el.a * (1 - el.e)) - 1 / el.a)
    for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
      const E = (i / ORBIT_SEGMENTS) * Math.PI * 2
      const nu = trueFromEccentric(E, el.e)
      const r = el.a * (1 - el.e * Math.cos(E))
      const th = nu + el.omega
      pts.push(toScene(r * Math.cos(th), r * Math.sin(th), s))
      const v = Math.sqrt(2 / r - 1 / el.a)
      const k = vMax > vMin ? (v - vMin) / (vMax - vMin) : 0
      const c = SLOW.clone().lerp(FAST, k)
      cols.push([c.r, c.g, c.b])
    }
    return { points: pts, colors: cols }
  }, [el, s])

  // Periastron and apoastron exist only for a measured ellipse.
  const ellipse = el.eStatus === 'measured' && el.e > 0
  const peri = toScene(ext.periastronAU * Math.cos(el.omega), ext.periastronAU * Math.sin(el.omega), s)
  const apo = toScene(-ext.apoastronAU * Math.cos(el.omega), -ext.apoastronAU * Math.sin(el.omega), s)
  const tPhase = transitPhase(el)
  const transitPoint = useMemo(() => {
    if (tPhase == null) return null
    const E = solveKepler(tPhase * Math.PI * 2, el.e)
    const nu = trueFromEccentric(E, el.e)
    const r = el.a * (1 - el.e * Math.cos(E))
    return toScene(r * Math.cos(nu + el.omega), r * Math.sin(nu + el.omega), s)
  }, [el, s, tPhase])

  // Buffers for per-frame updates; mutated only through refs in useFrame.
  const radiusPositions = useMemo(() => new Float32Array(6), [])
  const trailPositions = useMemo(() => new Float32Array(TRAIL_POINTS * 3), [])
  const trailColors = useMemo(() => {
    const c = new Float32Array(TRAIL_POINTS * 3)
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = (1 - i / TRAIL_POINTS) ** 1.6
      c.set([0.56 * f, 0.83 * f, 0.91 * f], i * 3)
    }
    return c
  }, [])
  const radiusRef = useRef()
  const trailRef = useRef()
  const arrowRef = useRef()

  const planetRef = useRef()
  const anchors = useMemo(
    () => [
      { id: 'planet', priority: 10, getAnchor: () => v3.copy(planetRef.current?.position ?? v3.set(0, 0, 0)).setY(layout.planetRadius * 1.3) },
      ...(ellipse
        ? [
            { id: 'peri', priority: 5, getAnchor: () => v3.set(peri[0], 0.08, peri[2]) },
            { id: 'apo', priority: 4, getAnchor: () => v3.set(apo[0], 0.08, apo[2]) },
          ]
        : []),
      ...(transitPoint ? [{ id: 'transit', priority: 3, getAnchor: () => v3.set(transitPoint[0], 0.08, transitPoint[2]) }] : []),
    ],
    [layout, peri, apo, transitPoint, ellipse],
  )

  useFrame((_, dt) => {
    const t = clock.step(Math.min(dt, 0.1))
    const direction = clock.direction()
    const st = orbitState(el, t)
    const [px, , pz] = toScene(st.x, st.y, s)
    planetRef.current.position.set(px, 0, pz)

    const pos = radiusRef.current.geometry.attributes.position
    pos.setXYZ(1, px, 0, pz)
    pos.needsUpdate = true

    // Trail: analytic positions over the last 3% of an orbit (also correct while scrubbing).
    const tp = trailRef.current.geometry.attributes.position
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const p = orbitState(el, t - direction * (i / TRAIL_POINTS) * el.P * 0.03)
      const q = toScene(p.x, p.y, s)
      tp.setXYZ(i, q[0], 0, q[2])
    }
    tp.needsUpdate = true

    // Velocity arrow: direction of motion, length scaled to the speed range.
    const speedFrac = Math.sqrt(2 / st.rAU - 1 / el.a) / Math.sqrt(2 / (el.a * (1 - el.e)) - 1 / el.a)
    dir.set(st.vDir[0] * direction, 0, -st.vDir[1] * direction).normalize()
    const arrow = arrowRef.current
    arrow.position.set(px, 0, pz)
    arrow.setDirection(dir)
    arrow.setLength(layout.planetRadius + 0.6 + 1.8 * speedFrac, 0.22, 0.12)
  })

  return (
    <>
      <Starfield count={4500} />
      <Star radius={layout.starRadius} color={star.color} seed={star.seed} />

      <Line points={points} vertexColors={colors} lineWidth={1.6} transparent opacity={0.9} depthWrite={false} raycast={() => null} />
      {ellipse && (
        <>
          {/* Line of apsides through the star. */}
          <Line points={[peri, apo]} color="#c9d6e8" lineWidth={1} dashed dashSize={0.18} gapSize={0.18} transparent opacity={0.22} raycast={() => null} />
          {[
            [peri, '#ffc98a'],
            [apo, '#7fc4dc'],
          ].map(([p, color]) => (
            <mesh key={color} position={p} raycast={() => null}>
              <sphereGeometry args={[0.07, 16, 12]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          ))}
        </>
      )}
      {transitPoint && (
        <Line points={[ORIGIN, [transitPoint[0] * 1.35, 0, transitPoint[2] * 1.35]]} color="#8fd3e8" lineWidth={1} dashed dashSize={0.08} gapSize={0.14} transparent opacity={0.45} raycast={() => null} />
      )}

      <line ref={radiusRef} raycast={() => null} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[radiusPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#c9d6e8" transparent opacity={0.35} depthWrite={false} />
      </line>
      <line ref={trailRef} raycast={() => null} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trailPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[trailColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} />
      </line>
      <arrowHelper ref={arrowRef} args={[X_AXIS, ZERO, 1, 0xffd9a8, 0.22, 0.12]} />

      <group ref={planetRef}>
        <ProceduralPlanet params={planetParams} detail="system" radius={layout.planetRadius} lightPosition={ORIGIN} spinSpeed={0.2} />
      </group>

      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.5} maxPolarAngle={Math.PI * 0.49} />
      <FitCamera radius={layout.frameRadius} center={layout.center} margin={1.1} minFactor={0.25} maxFactor={2.5} />
      <LabelProjector labelRefs={labelRefs} anchors={anchors} starRadius={layout.starRadius} />
    </>
  )
}
