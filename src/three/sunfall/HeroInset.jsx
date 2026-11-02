// SUNFALL hero inset — owner: LEAD (Stage S3.1). One enlarged copy of the
// selected planet in a screen corner, drawn by the same ProceduralPlanet and
// key light as Planet Viewport, on a heads-up layer of the same Canvas (one
// extra planet render, no second WebGL context). The swarm's copies stay to
// scale; this inset only shows what each copy looks like.

import { Hud, OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { PLANET_KEY_LIGHT } from '../planet/keyLight.js'
import ProceduralPlanet from '../planet/ProceduralPlanet.jsx'
import { heroInsetLayout } from './camera.js'

const KEY = Math.hypot(...PLANET_KEY_LIGHT)

/** @param {{ params: object, animate: boolean }} props */
export default function HeroInset({ params, animate }) {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const { radius, center } = heroInsetLayout(width, height)
  // Light from the Planet Viewport key direction, far enough to act as a sun.
  const light = PLANET_KEY_LIGHT.map((c, i) => (c / KEY) * radius * 40 + (i < 2 ? center[i] : 0))

  return (
    <Hud renderPriority={1}>
      <OrthographicCamera makeDefault left={0} right={width} top={height} bottom={0} near={-2000} far={2000} position={[0, 0, 1000]} />
      <ProceduralPlanet params={params} detail="card" radius={radius} position={[center[0], center[1], 0]} lightPosition={light} spin={animate} spinSpeed={0.12} />
    </Hud>
  )
}
