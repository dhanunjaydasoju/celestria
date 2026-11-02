// SUNFALL scene contents — owner: LEAD (Stage S3). Lives inside a Canvas.
// The Sun stays the focal point: copies are small and lit by it, and the
// camera only drifts slowly in. A Driver advances the playback clock, feeds
// the shared time to the GPU and writes the counter to the DOM at ~10 Hz
// (no React re-render per frame).

import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import Starfield from '../shared/Starfield.jsx'
import Sun from '../sun/Sun.jsx'
import { CAMERA_Z, FOV, SUN_SCENE_RADIUS, cameraPose, flashWorldSize } from './camera.js'
import { tick } from './clock.js'
import { counterText, progressAt } from './plan.js'
import HeroInset from './HeroInset.jsx'
import { ArrivalFlashes, PlanetSwarm } from './PlanetSwarm.jsx'
import { buildTrajectories, seedFrom } from './trajectories.js'

function Driver({ clockRef, timeRef, result, plan, onCounter, onState }) {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const last = useRef({ text: null, at: -1, playing: null, finished: null })
  useFrame((_, dt) => {
    const before = clockRef.current
    const c = tick(before, dt)
    clockRef.current = c
    timeRef.current = c.t
    camera.position.set(...cameraPose(c.t, c.total, aspect))
    camera.lookAt(0, 0, 0)

    const l = last.current
    if (c.playing !== l.playing || c.finished !== l.finished) {
      l.playing = c.playing
      l.finished = c.finished
      onState?.({ playing: c.playing, finished: c.finished })
    }
    if (plan.animate && (c.finished || c.t - l.at >= 0.1 || c.t < l.at)) {
      l.at = c.t
      const text = counterText(result, c.finished ? 1 : progressAt(c.t, plan))?.value
      if (text !== l.text) {
        l.text = text
        onCounter(text)
      }
    }
  })
  return null
}

/**
 * @param {{ planetId: string, params: object, result: object, plan: object, tier: object, tierKey: 'high'|'low',
 *           animate: boolean, clockRef: object, onCounter: (text: string) => void, onState: (s: object) => void }} props
 */
export default function SunfallScene({ planetId, params, result, plan, tier, tierKey, animate, clockRef, onCounter, onState }) {
  const timeRef = useRef(0) // set by the Driver every frame
  const paths = useMemo(
    () =>
      plan.animate
        ? buildTrajectories(plan.copies, { sunRadius: SUN_SCENE_RADIUS, cameraZ: CAMERA_Z, lead: plan.lead, duration: plan.duration, seed: seedFrom(planetId), copyRadius: plan.size.scene })
        : null,
    [plan, planetId],
  )
  const detail = tierKey === 'high' ? { subdivisions: 4, octaves: 4 } : { subdivisions: 2, octaves: 3 }
  const flashSize = (plan.animate ? flashWorldSize(plan.size.scene) : 0) / Math.tan(((FOV / 2) * Math.PI) / 180)

  return (
    <>
      <Starfield count={tier.stars} />
      <Sun radius={SUN_SCENE_RADIUS} tier={tier} animate={animate} />
      {plan.animate && (
        <>
          <PlanetSwarm params={params} paths={paths} count={plan.copies} scale={plan.size.scene} timeRef={timeRef} {...detail} />
          <ArrivalFlashes paths={paths} count={plan.copies} size={flashSize} timeRef={timeRef} />
          <HeroInset params={params} animate={animate} />
        </>
      )}
      <Driver clockRef={clockRef} timeRef={timeRef} result={result} plan={plan} onCounter={onCounter} onState={onState} />
    </>
  )
}
