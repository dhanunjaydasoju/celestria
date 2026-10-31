// Homepage hero: realistic Earth with a Soyuz-inspired spacecraft in orbit —
// owner: LEAD. Self-contained viewport (own Canvas, Suspense, fallback).
//
// Earth: NASA imagery (public/textures/earth/CREDITS.md), lit by the Sun's
// real position now. Spacecraft: an illustration on a 51.6° orbit; size,
// altitude and speed are not to scale (labelled). Decorative: aria-hidden.
// Props: { reducedMotion?: boolean } (src/contracts/viewports.js).

import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial } from 'three'
import { AXIS_TILT, framing, sunComposition } from '../earth/composition.js'
import Earth from '../earth/Earth.jsx'
import { craftPose, RAAN_DEG } from '../earth/craftPose.js'
import { orbitPath, INCLINATION_DEG } from '../earth/orbit.js'
import { detectTier, TIERS } from '../earth/quality.js'
import Soyuz from '../earth/Soyuz.jsx'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import { SPACE_BACKGROUND } from '../shared/space.js'
import Starfield from '../shared/Starfield.jsx'
import '../earth/EarthHero.css'
import './Viewport.css'

const FOV = 28
const CRAFT_SCALE = 0.034 // ≈7.5 m craft drawn ≈0.26 Earth radii long (hugely enlarged; labelled)
const SUN_REFRESH_MS = 60_000

function OrbitLine() {
  const line = useMemo(() => {
    const pts = orbitPath(256, { raanDeg: RAAN_DEG }).flat()
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return { g, m: new LineBasicMaterial({ color: '#9fc6ff', transparent: true, opacity: 0.22, depthWrite: false }) }
  }, [])
  useEffect(
    () => () => {
      line.g.dispose()
      line.m.dispose()
    },
    [line],
  )
  return <lineLoop geometry={line.g} material={line.m} />
}

function OrbitingSoyuz({ sunLocal, animate, startTime }) {
  const ref = useRef()
  const t = useRef(startTime)
  // Correct pose from the first frame (and for reduced motion, which never advances).
  const initial = useMemo(() => craftPose(startTime, sunLocal), [startTime, sunLocal])
  useFrame((_, delta) => {
    if (!animate) return
    t.current += Math.min(delta, 0.1)
    const pose = craftPose(t.current, sunLocal)
    ref.current.position.set(...pose.position)
    ref.current.quaternion.copy(pose.quaternion)
  })
  return (
    <group ref={ref} position={initial.position} quaternion={initial.quaternion}>
      <Soyuz scale={CRAFT_SCALE} />
    </group>
  )
}

/** Camera framing for the canvas aspect, plus a slow drift and pointer parallax. */
function Rig({ onLayout, animate }) {
  const size = useThree((s) => s.size)
  const f = useMemo(() => framing(size.width / size.height, FOV), [size.width, size.height])
  useEffect(() => onLayout(f), [f, onLayout])
  useFrame((state) => {
    const { camera, pointer } = state
    const time = state.clock.elapsedTime
    const sway = animate ? 1 : 0
    const px = animate && f.layout === 'wide' ? pointer.x * 0.12 : 0
    const py = animate && f.layout === 'wide' ? pointer.y * 0.06 : 0
    camera.position.x += (Math.sin(time * 0.045) * 0.12 * sway + px - camera.position.x) * 0.04
    camera.position.y += (0.18 + Math.cos(time * 0.037) * 0.06 * sway + py - camera.position.y) * 0.04
    camera.position.z = f.distance
    camera.lookAt(f.layout === 'wide' ? 0 : f.earth[0], f.layout === 'wide' ? 0 : f.earth[1] * 0.75, 0)
  })
  return null
}

function Ready({ onReady }) {
  useEffect(() => onReady(), [onReady])
  return null
}

function Scene({ tier, sun, animate, startTime, onReady }) {
  const [layout, setLayout] = useState(() => framing(16 / 9, FOV))
  const earthPos = layout.earth
  const sunWorldPos = useMemo(() => sun.sunWorld.map((c, i) => c * 30 + earthPos[i]), [sun, earthPos])
  return (
    <>
      <color attach="background" args={[SPACE_BACKGROUND]} />
      <Rig onLayout={setLayout} animate={animate} />
      <Starfield count={tier.stars} />
      <directionalLight position={sunWorldPos} intensity={3.1} color="#fff6ea" />
      {/* Fill for the spacecraft: blue earthshine from below, faint sky from above */}
      <hemisphereLight args={['#1b2233', '#6f8fc8', 0.55]} />
      <ambientLight intensity={0.12} color="#7d97c6" />
      <Suspense fallback={null}>
        <Earth tier={tier} sunDir={sun.sunWorld} tilt={AXIS_TILT} yaw={sun.yaw} position={earthPos} animate={animate} />
        <group position={earthPos} rotation={AXIS_TILT}>
          <OrbitLine />
          <OrbitingSoyuz sunLocal={sun.sunLocal} animate={animate} startTime={startTime} />
        </group>
        <Ready onReady={onReady} />
      </Suspense>
    </>
  )
}

/** Shown while textures load and if WebGL is unavailable. */
function Poster() {
  return <div className="earth-poster" />
}

/**
 * @param {{ reducedMotion?: boolean, startTime?: number }} props
 *   startTime: seconds into the orbit at mount (the lab uses it to inspect poses)
 */
export default function EarthHeroScene({ reducedMotion = false, startTime = 0 }) {
  const [tierKey, setTierKey] = useState(() => detectTier())
  const tier = TIERS[tierKey]
  const [sun, setSun] = useState(() => sunComposition(new Date()))
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(true)
  const box = useRef(null)

  // Real Sun position, refreshed each minute (the terminator moves 0.25°/min).
  useEffect(() => {
    const id = setInterval(() => setSun(sunComposition(new Date())), SUN_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // Render only while the hero is on screen and the tab is visible.
  useEffect(() => {
    const el = box.current
    let onScreen = true
    const update = () => setVisible(onScreen && document.visibilityState === 'visible')
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => ((onScreen = e.isIntersecting), update()), { threshold: 0.01 })
    io?.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      io?.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return (
    <div ref={box} className={`viewport viewport--hero earth-hero${ready ? ' is-ready' : ''}`} aria-hidden="true">
      <Poster />
      <CanvasErrorBoundary fallback={null}>
        <Canvas
          className="earth-hero__canvas"
          dpr={tier.dpr}
          frameloop={visible ? 'always' : 'never'}
          camera={{ position: [0, 0.18, 5.4], fov: FOV, near: 0.05, far: 2000 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <PerformanceMonitor onDecline={() => setTierKey('low')} flipflops={1} />
          <Scene tier={tier} sun={sun} animate={!reducedMotion} startTime={startTime} onReady={() => setReady(true)} />
        </Canvas>
      </CanvasErrorBoundary>
      <p className="earth-hero__credit">
        <span>Earth imagery: NASA Earth Observatory (Blue Marble, Black Marble) · day and night as lit by the Sun now.</span>{' '}
        <span>Spacecraft: Soyuz-inspired illustration on a {INCLINATION_DEG}° orbit · size, altitude and speed not to scale.</span>
      </p>
    </div>
  )
}
