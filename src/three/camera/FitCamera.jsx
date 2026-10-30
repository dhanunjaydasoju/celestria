// Keeps a bounding sphere framed as the canvas resizes — owner: LEAD.
// Moves the camera along its current view direction (so user rotation is
// kept) and rescales OrbitControls zoom limits. Requires <OrbitControls
// makeDefault /> if limits should follow.

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { fitDistance } from './framing.js'

const dir = new Vector3()

/**
 * @param {{ radius: number, center?: [number, number, number], margin?: number, minFactor?: number, maxFactor?: number }} props
 */
export default function FitCamera({ radius, center = [0, 0, 0], margin = 1.15, minFactor = 0.55, maxFactor = 2.2 }) {
  const get = useThree((s) => s.get)
  const hasControls = useThree((s) => s.controls != null) // re-fit once controls mount
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const [cx, cy, cz] = center

  useEffect(() => {
    const { camera, controls } = get()
    const d = fitDistance(radius, camera.fov, aspect, margin)
    if (d == null) return
    dir.set(camera.position.x - cx, camera.position.y - cy, camera.position.z - cz)
    if (dir.lengthSq() === 0) dir.set(0, 0, 1)
    dir.normalize()
    camera.position.set(cx + dir.x * d, cy + dir.y * d, cz + dir.z * d)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(cx, cy, cz)
      controls.minDistance = d * minFactor
      controls.maxDistance = d * maxFactor
      controls.update()
    }
  }, [get, hasControls, aspect, radius, cx, cy, cz, margin, minFactor, maxFactor])

  return null
}
