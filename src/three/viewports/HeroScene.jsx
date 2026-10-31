// Landing-page background — owner: LEAD. Decorative and non-interactive:
// a starfield and one slowly turning procedural gas giant at a crescent
// phase. The planet is built from fixed showcase parameters (not a catalog
// planet) so the home page needs no data; it is labelled as an artistic
// impression. Props: none (src/contracts/viewports.js, HeroSceneProps).

import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import ProceduralPlanet from '../planet/ProceduralPlanet.jsx'
import { visualParams } from '../planet/visualParams.js'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import { SPACE_BACKGROUND } from '../shared/space.js'
import Starfield from '../shared/Starfield.jsx'
import './Viewport.css'

const q = (value) => ({ value, status: 'measured' })
const MISSING = { value: null, status: 'missing' }

// Showcase inputs: a temperate-to-cold giant (banded, creamy palette).
const SHOWCASE = {
  id: 'celestria-hero',
  name: 'CELESTRIA showcase',
  radiusEarth: q(11),
  massEarth: MISSING,
  eqTempK: q(160),
  insolationEarth: MISSING,
  star: { teff: q(5600) },
}

// Light from behind-left: a thin crescent, which reads well behind text.
const LIGHT = [-14, 4, -9]

export default function HeroScene() {
  const params = useMemo(() => visualParams(SHOWCASE), [])
  return (
    <div className="viewport viewport--hero" aria-hidden="true">
      <CanvasErrorBoundary fallback={null}>
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 9], fov: 35 }} gl={{ antialias: true }}>
          <color attach="background" args={[SPACE_BACKGROUND]} />
          <Suspense fallback={null}>
            <Starfield count={5000} />
            <ProceduralPlanet params={params} detail="hero" radius={2.9} position={[2.6, -1.4, 0]} lightPosition={LIGHT} spinSpeed={0.025} />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>
    </div>
  )
}
