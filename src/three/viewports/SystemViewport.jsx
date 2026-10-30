// One planetary system — owner: LEAD. Priority: CORE.
// Props: src/contracts/viewports.js (SystemViewportProps).

import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import SystemScene from '../scenes/SystemScene.jsx'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import { buildSystemModel } from '../system/systemModel.js'
import { SCALE_NOTES } from '../scale.js'
import './Viewport.css'
import './SystemViewport.css'
import { SPACE_BACKGROUND } from '../shared/space.js'

const LEGEND = {
  catalog: { label: 'Distance from NASA archive', line: 'solid' },
  kepler: { label: "Distance calculated from period and star mass (Kepler's third law)", line: 'dashed' },
  arbitrary: { label: 'No distance data: position arbitrary', line: 'dotted' },
}

const SOURCE_SHORT = { catalog: null, kepler: 'distance calculated', arbitrary: 'position arbitrary' }

/** @param {import('../../contracts/viewports.js').SystemViewportProps} props */
export default function SystemViewport({
  host,
  planets,
  selectedId = null,
  onSelectPlanet = () => {},
  paused = false,
  timeScale = 1,
  resetToken = 0,
  reducedMotion = false,
}) {
  const model = useMemo(() => buildSystemModel(planets), [planets])
  const [hoveredId, setHoveredId] = useState(null)
  const labelRefs = useRef(new Map())

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onSelectPlanet(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelectPlanet])

  const notes = [SCALE_NOTES.system, SCALE_NOTES.time, 'Orbits drawn circular and coplanar; positions illustrative, not real-time']
  if (model.star.imputed.includes('radius')) notes.push('Star radius unknown: neutral size shown')
  if (model.star.imputed.includes('color')) notes.push('Star temperature unknown: neutral colour shown')

  const fallback = (
    <div className="viewport__fallback">
      <strong>3D view unavailable</strong>
      <span>
        {host}: {planets.length} planet{planets.length === 1 ? '' : 's'}
      </span>
    </div>
  )

  return (
    <div className="viewport viewport--system">
      <CanvasErrorBoundary fallback={fallback}>
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 12, 40], fov: 40, near: 0.05, far: 2000 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => onSelectPlanet(null)}
          aria-label={`Artistic 3D impression of the ${host} planetary system`}
        >
          <color attach="background" args={[SPACE_BACKGROUND]} />
          <Suspense fallback={null}>
            <SystemScene
              key={host}
              model={model}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={onSelectPlanet}
              onHover={setHoveredId}
              paused={paused}
              timeScale={timeScale}
              resetToken={resetToken}
              reducedMotion={reducedMotion}
              labelRefs={labelRefs}
            />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>

      {/* Labels are also tap targets (easier than small planets on phones). */}
      <div className="sv-labels" aria-hidden="true">
        {model.planets.map((p) => {
          const active = p.id === selectedId || p.id === hoveredId
          const sub = SOURCE_SHORT[p.distance.source]
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) labelRefs.current.set(p.id, el)
                else labelRefs.current.delete(p.id)
              }}
              className={`sv-label${p.id === selectedId ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
              onClick={() => onSelectPlanet(p.id)}
              onPointerEnter={() => setHoveredId(p.id)}
              onPointerLeave={() => setHoveredId(null)}
            >
              {p.planet.name}
              {sub && <span className="sv-label__sub">{sub}</span>}
            </div>
          )
        })}
      </div>

      <div className="sv-notes">
        <p className="sv-notes__kicker">Artistic impression</p>
        <ul className="sv-legend">
          {[...model.sources].map((s) => (
            <li key={s}>
              <span>{LEGEND[s].label}</span>
              <span className={`sv-legend__line sv-legend__line--${LEGEND[s].line}`} />
            </li>
          ))}
        </ul>
        <ul className="sv-notes__list">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
