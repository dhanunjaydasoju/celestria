// Orbital Simulator 3D view — owner: LEAD (M3).
// The page owns the clock (time, play state, rate); this view renders the
// orbit at the clock's time and advances it while playing.

import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import { orbitExtremes } from '../../science/kepler.js'
import { visualParams } from '../planet/visualParams.js'
import OrbitScene from '../scenes/OrbitScene.jsx'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import { sig } from '../shared/format.js'
import { SPACE_BACKGROUND } from '../shared/space.js'
import { blackbodyRGB, NEUTRAL_STAR_RGB } from '../star/starColor.js'
import { hashSeed } from '../planet/visualParams.js'
import { orbitLayout } from '../system/orbitLayout.js'
import { scienceValue } from '../../contracts/planet.js'
import './Viewport.css'
import './OrbitViewport.css'

/**
 * @param {Object} props
 * @param {import('../../contracts/planet.js').Planet} props.planet
 * @param {ReturnType<typeof import('../../science/kepler.js').orbitalElements>} props.el
 * @param {{ step: (dt: number) => number, direction: () => 1|-1 }} props.clock  owned by the page
 */
export default function OrbitViewport({ planet, el, clock }) {
  const planetParams = useMemo(() => visualParams(planet), [planet])
  const layout = useMemo(() => orbitLayout(el), [el])
  const ext = useMemo(() => orbitExtremes(el), [el])
  const star = useMemo(
    () => ({
      color: blackbodyRGB(scienceValue(planet.star?.teff)) ?? [...NEUTRAL_STAR_RGB],
      seed: hashSeed(planet.star?.name ?? planet.host ?? ''),
    }),
    [planet],
  )
  const labelRefs = useRef(new Map())
  const physical = el.aSource !== 'normalised'
  const au = (v) => (physical ? `${sig(v)} AU` : 'relative scale')

  const scaleNote = [
    physical ? 'Orbit shape and distances to scale' : 'Orbit shape to scale; size unknown',
    layout.starTrueScale ? 'star to scale' : 'star enlarged',
    'planet enlarged',
  ].join(' · ')

  return (
    <div className="viewport viewport--orbit">
      <CanvasErrorBoundary
        fallback={
          <div className="viewport__fallback">
            <strong>3D view unavailable</strong>
          </div>
        }
      >
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 14, 9], fov: 40, near: 0.01, far: 2000 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          aria-label={`Orbit of ${planet.name} around ${planet.host}`}
        >
          <color attach="background" args={[SPACE_BACKGROUND]} />
          <Suspense fallback={null}>
            <OrbitScene key={planet.id} el={el} planetParams={planetParams} star={star} clock={clock} labelRefs={labelRefs} />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>

      <div className="sv-labels ov-labels" aria-hidden="true">
        <div ref={(n) => (n ? labelRefs.current.set('planet', n) : labelRefs.current.delete('planet'))} className="sv-label is-selected">
          {planet.name}
        </div>
        {el.eStatus === 'measured' && el.e > 0 && (
          <>
            <div ref={(n) => (n ? labelRefs.current.set('peri', n) : labelRefs.current.delete('peri'))} className="sv-label ov-label ov-label--peri">
              Periastron
              <span className="sv-label__sub">{au(ext.periastronAU)}</span>
            </div>
            <div ref={(n) => (n ? labelRefs.current.set('apo', n) : labelRefs.current.delete('apo'))} className="sv-label ov-label ov-label--apo">
              Apoastron
              <span className="sv-label__sub">{au(ext.apoastronAU)}</span>
            </div>
          </>
        )}
        {el.transits && (
          <div ref={(n) => (n ? labelRefs.current.set('transit', n) : labelRefs.current.delete('transit'))} className="sv-label ov-label">
            Transit
            <span className="sv-label__sub">toward Earth</span>
          </div>
        )}
      </div>

      <div className="ov-notes">
        <p className="sv-notes__kicker">Artistic impression</p>
        <p>{scaleNote}</p>
        {el.eStatus === 'measured' && el.e > 0 && <p className="ov-notes__legend">
          <span className="ov-swatch ov-swatch--slow" /> slower
          <span className="ov-swatch ov-swatch--fast" /> faster
        </p>}
      </div>
    </div>
  )
}
