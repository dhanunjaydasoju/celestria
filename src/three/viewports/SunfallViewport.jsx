// SUNFALL viewport — owner: LEAD (Stage S3). Owns its Canvas, error
// fallback, quality tier, playback clock and the result overlay. Takes a
// planet and its S1 result (src/science/sunfall.js) as props.

import { PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { SUNFALL_WORDING, sunfallHeadline } from '../../science/sunfall.js'
import { visualParams } from '../planet/visualParams.js'
import CanvasErrorBoundary from '../shared/CanvasErrorBoundary.jsx'
import { SPACE_BACKGROUND } from '../shared/space.js'
import { createClock, finish, replay, toggle } from '../sunfall/clock.js'
import { perCopyText, planSwarm } from '../sunfall/plan.js'
import { SUNFALL_CAMERA, SUN_SCENE_RADIUS } from '../sunfall/camera.js'
import SunfallScene from '../sunfall/SunfallScene.jsx'
import { detectTier, sunTier } from '../sun/quality.js'
import '../sunfall/Sunfall.css'
import './Viewport.css'

const PROVENANCE_TAG = { measured: 'Measured radius', calculated: 'Radius calculated by NASA', estimated: 'Estimated radius' }

/**
 * @param {{ planet: import('../../contracts/planet.js').Planet,
 *           result: import('../../science/sunfall.js').SunfallResult & { planetName: string },
 *           quality?: 'auto'|'high'|'low', reducedMotion?: boolean }} props
 */
export default function SunfallViewport({ planet, result, quality = 'auto', reducedMotion = false }) {
  const [autoKey, setAutoKey] = useState(() => detectTier())
  const tierKey = quality === 'auto' ? autoKey : quality
  const tier = sunTier(tierKey)
  const params = useMemo(() => visualParams(planet), [planet])
  const plan = useMemo(() => planSwarm(result, { tier: tierKey, sunSceneRadius: SUN_SCENE_RADIUS }), [result, tierKey])

  // No usable radius: nothing to play, so the clock starts (and stays) finished.
  const still = reducedMotion || !plan.animate
  const total = plan.animate ? plan.total : 1
  const [initial] = useState(() => createClock(total, { reducedMotion: still }))
  const clockRef = useRef(initial)
  const [ui, setUi] = useState({ playing: initial.playing, finished: initial.finished })
  const counterEl = useRef(null)
  // The scene writes the counter straight to the DOM (~10 Hz), not via state.
  const writeCounter = (text) => {
    if (counterEl.current) counterEl.current.textContent = text
  }

  // A new planet, tier or motion setting restarts the sequence.
  useEffect(() => {
    clockRef.current = createClock(total, { reducedMotion: still })
    setUi({ playing: clockRef.current.playing, finished: clockRef.current.finished })
  }, [total, still, plan])

  const act = (fn) => {
    clockRef.current = fn(clockRef.current)
    setUi({ playing: clockRef.current.playing, finished: clockRef.current.finished })
  }

  const headline = ui.finished ? sunfallHeadline(result) : null
  const perCopy = perCopyText(plan)

  return (
    <div className="viewport viewport--hero sunfall">
      <CanvasErrorBoundary
        fallback={
          <div className="viewport__fallback">
            <strong>3D view unavailable</strong>
            <span>{sunfallHeadline(result) ?? 'No volume comparison can be made for this planet.'}</span>
          </div>
        }
      >
        <Canvas key={tierKey} dpr={tier.dpr} camera={SUNFALL_CAMERA} gl={{ antialias: true, powerPreference: 'high-performance' }} aria-label={`Artistic 3D impression: copies of ${planet.name} falling into the Sun`}>
          <color attach="background" args={[SPACE_BACKGROUND]} />
          {quality === 'auto' && <PerformanceMonitor onDecline={() => setAutoKey('low')} flipflops={1} />}
          <Suspense fallback={null}>
            <SunfallScene
              planetId={planet.id}
              params={params}
              result={result}
              plan={plan}
              tier={tier}
              tierKey={tierKey}
              animate={!reducedMotion}
              clockRef={clockRef}
              onCounter={writeCounter}
              onState={setUi}
            />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>

      <div className="sunfall__labels">
        <p className="sunfall__kicker">Artistic impression · not to scale in distance</p>
        <p>{plan.animate ? `Our Sun and copies of ${planet.name}` : 'Our Sun'}</p>
        {plan.animate && (
          <ul>
            <li>
              {PROVENANCE_TAG[result.radiusProvenance]}
              {result.radius?.modelBased && ' (model-based)'}
              {result.relation === '>' && ' · upper limit only'}
              {result.relation === '<' && ' · lower limit only'}
            </li>
            <li>{plan.size.enlarged ? `Copies enlarged ×${plan.size.factor.toFixed(1)} for visibility; the Sun is not` : 'Copies drawn at true size relative to the Sun'}; nearer copies look larger (perspective)</li>
            {perCopy && <li>{perCopy}</li>}
          </ul>
        )}
      </div>

      {plan.animate && (
        <p className="sunfall__hero">
          <strong>Each copy</strong>
          <span className="sunfall__hero-name">{planet.name}</span>
          <span className="sunfall__hero-long">Enlarged here; the copies in the scene are to scale</span>
          <span className="sunfall__hero-short">(enlarged)</span>
        </p>
      )}

      <div className="sunfall__result" aria-live="polite">
        {plan.animate ? (
          <>
            {/* Text written by the scene's Driver (S1 value × share arrived); no React children. */}
            <p className="sunfall__counter num" ref={counterEl} aria-hidden={!ui.finished} />
            <p className="sunfall__unit">planet volumes = the Sun’s volume</p>
            {headline && <p className="sunfall__headline">{headline}</p>}
            {ui.finished && result.display?.low && (
              <p className="sunfall__range num">
                Range from the radius uncertainty: {result.display.low} – {result.display.high ?? 'unbounded'}
              </p>
            )}
            {ui.finished && <p className="sunfall__note">{SUNFALL_WORDING.packing}</p>}
          </>
        ) : (
          <>
            <p className="sunfall__headline">No volume comparison for {planet.name}</p>
            <p className="sunfall__note">{result.reason}. A radius is needed; none is invented.</p>
          </>
        )}
      </div>

      {plan.animate && (
        <div className="sunfall__controls" role="group" aria-label="Playback">
          {!ui.finished && (
            <button type="button" onClick={() => act(toggle)} aria-label={ui.playing ? 'Pause' : 'Resume'}>
              {ui.playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {ui.playing ? 'Pause' : 'Resume'}
            </button>
          )}
          {!ui.finished && (
            <button type="button" onClick={() => act(finish)}>
              <SkipForward size={15} aria-hidden="true" /> Skip to result
            </button>
          )}
          <button type="button" onClick={() => act((c) => replay(c, { reducedMotion: still }))}>
            <RotateCcw size={15} aria-hidden="true" /> Replay
          </button>
        </div>
      )}
    </div>
  )
}
