// Standalone Sun view — owner: LEAD (SUNFALL Stage S2). Owns its Canvas,
// error fallback and quality tier; fills its parent box. The SUNFALL scene
// will build on <Sun>; this viewport exists to inspect and tune it.

import { OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import FitCamera from '../camera/FitCamera.jsx'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import Starfield from '../shared/Starfield.jsx'
import { SPACE_BACKGROUND } from '../shared/space.js'
import Sun from '../sun/Sun.jsx'
import { detectTier, sunTier } from '../sun/quality.js'
import '../shared/ViewportLabels.css'
import './Viewport.css'

/**
 * @param {Object} props
 * @param {'auto'|'high'|'low'} [props.quality='auto']  auto: device detection, drops to low if the frame rate falls
 * @param {boolean} [props.reducedMotion=false]
 * @param {number} [props.fit=2.4]          radius (in solar radii) kept in frame; < 1 fills the screen with the disc
 * @param {number} [props.intensity]        photosphere brightness
 * @param {{ prominences?: boolean, corona?: boolean, chromosphere?: boolean }} [props.layers]
 * @param {boolean} [props.interactive=true]
 * @param {(tier: string) => void} [props.onTier]
 */
export default function SunViewport({ quality = 'auto', reducedMotion = false, fit = 2.4, intensity, layers, interactive = true, onTier }) {
  const [autoKey, setAutoKey] = useState(() => detectTier())
  const key = quality === 'auto' ? autoKey : quality
  const tier = sunTier(key)

  return (
    <div className="viewport viewport--hero">
      <CanvasErrorBoundary
        fallback={
          <div className="viewport__fallback">
            <strong>3D view unavailable</strong>
            <span>Our Sun · artistic impression</span>
          </div>
        }
      >
        <Canvas
          key={key /* new context when the tier changes geometry and shader defines */}
          dpr={tier.dpr}
          camera={{ position: [0, 0, 8], fov: 35, near: 0.05, far: 2000 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          aria-label="Artistic 3D impression of the Sun"
        >
          <color attach="background" args={[SPACE_BACKGROUND]} />
          {quality === 'auto' && (
            <PerformanceMonitor
              onDecline={() => {
                setAutoKey('low')
                onTier?.('low')
              }}
              flipflops={1}
            />
          )}
          <Suspense fallback={null}>
            <Starfield count={tier.stars} />
            <Sun tier={tier} animate={!reducedMotion} intensity={intensity} layers={layers} />
          </Suspense>
          {interactive && <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.4} zoomSpeed={0.6} />}
          <FitCamera radius={fit} margin={1} minFactor={0.35} maxFactor={3} />
        </Canvas>
      </CanvasErrorBoundary>
      <div className="vp-labels">
        <p className="vp-labels__kicker">Artistic impression</p>
        <p className="vp-labels__type">Our Sun</p>
        <p className="vp-labels__coverage">Colours stylised: the Sun’s true colour is close to white</p>
      </div>
    </div>
  )
}
