// Single procedural planet view — owner: LEAD. Priority: CORE.
// Props: src/contracts/viewports.js (PlanetViewportProps).

import { OrbitControls, Stars } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import ProceduralPlanet from '../planet/ProceduralPlanet.jsx'
import { visualParams } from '../planet/visualParams.js'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import ViewportLabels from '../shared/ViewportLabels.jsx'
import './Viewport.css'

// Star placed to the upper left, slightly in front: a gibbous phase with a
// visible terminator, so night-side glow on hot worlds can be seen.
const LIGHT_POSITION = [-10, 3, 3.5]

const SIZES = {
  hero: { detail: 'hero', distance: 4.4, dpr: [1, 1.75], stars: true },
  card: { detail: 'card', distance: 3.5, dpr: [1, 1.25], stars: false },
}

/** @param {import('../../contracts/viewports.js').PlanetViewportProps} props */
export default function PlanetViewport({ planet, size = 'hero', autoRotate = true, interactive = true }) {
  const params = useMemo(() => visualParams(planet), [planet])
  const cfg = SIZES[size] ?? SIZES.hero

  const fallback = (
    <div className="viewport__fallback">
      <strong>3D view unavailable</strong>
      <span>
        {params.archetypeLabel} · {params.thermalLabel}
      </span>
    </div>
  )

  return (
    <div className={`viewport viewport--${size}`}>
      <CanvasErrorBoundary fallback={fallback}>
        <Canvas
          dpr={cfg.dpr}
          camera={{ position: [0, 0, cfg.distance], fov: 35, near: 0.1, far: 200 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          aria-label={`Artistic 3D impression of ${planet.name}`}
        >
          <Suspense fallback={null}>
            {cfg.stars && <Stars radius={60} depth={30} count={2500} factor={2.2} saturation={0} fade speed={0.25} />}
            <ProceduralPlanet
              params={params}
              detail={cfg.detail}
              lightPosition={LIGHT_POSITION}
              spin={autoRotate}
            />
          </Suspense>
          {interactive && (
            <OrbitControls
              enablePan={false}
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.5}
              zoomSpeed={0.6}
              minDistance={1.6}
              maxDistance={7}
            />
          )}
        </Canvas>
      </CanvasErrorBoundary>
      <ViewportLabels params={params} compact={size === 'card'} />
    </div>
  )
}
