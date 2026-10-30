// Smooth camera transitions for system views — owner: LEAD.
//
// Works with <OrbitControls makeDefault />. With a focus target it flies to
// the target and then follows it as it orbits, while the user can still
// rotate/zoom around it. Without one it eases back to the overview pose.
// Any user drag cancels an in-progress transition.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

const target = new Vector3()
const desired = new Vector3()
const offset = new Vector3()
const delta = new Vector3()

/**
 * @param {Object} props
 * @param {() => Vector3|null} props.getFocus      world position of the focus each frame, or null
 * @param {number} props.focusDistance             camera distance when focused
 * @param {[number, number, number]} props.overviewPosition
 * @param {any} props.transitionKey                changes start a new transition
 * @param {boolean} [props.instant=false]          reduced motion: cut instead of ease
 */
export default function CameraRig({ getFocus, focusDistance, overviewPosition, transitionKey, instant = false }) {
  const get = useThree((s) => s.get)
  const state = useRef({ transitioning: true, last: null })

  useEffect(() => {
    state.current.transitioning = true
    state.current.last = null
  }, [transitionKey])

  useEffect(() => {
    const controls = get().controls
    if (!controls) return
    const cancel = () => {
      state.current.transitioning = false
    }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [get])

  useFrame((_, dt) => {
    const { camera, controls } = get()
    if (!controls) return
    const s = state.current
    const k = instant ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 3.2)
    const focus = getFocus()

    if (focus) {
      target.copy(focus)
      // Follow the moving planet: shift camera and pivot by its motion.
      if (s.last) {
        delta.subVectors(target, s.last)
        camera.position.add(delta)
        controls.target.add(delta)
      }
      s.last = (s.last ?? new Vector3()).copy(target)

      if (s.transitioning) {
        controls.target.lerp(target, k)
        offset.subVectors(camera.position, controls.target)
        if (offset.lengthSq() < 1e-6) offset.set(0, 0.4, 1)
        desired.copy(target).add(offset.normalize().multiplyScalar(focusDistance))
        camera.position.lerp(desired, k)
        if (camera.position.distanceTo(desired) < 0.01 && controls.target.distanceTo(target) < 0.01) {
          s.transitioning = false
        }
      }
    } else {
      s.last = null
      if (s.transitioning) {
        desired.set(...overviewPosition)
        controls.target.lerp(target.set(0, 0, 0), k)
        camera.position.lerp(desired, k)
        if (camera.position.distanceTo(desired) < 0.02 && controls.target.lengthSq() < 1e-4) s.transitioning = false
      }
    }
    controls.update()
  })

  return null
}
