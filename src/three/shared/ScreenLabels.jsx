// Readable, uncluttered planet labels — owner: LEAD.
//
// Labels are plain DOM elements in one overlay (no per-label React roots).
// <LabelProjector> runs inside the Canvas and, each frame, projects anchor
// points to screen space, hides labels behind the camera or the star, and
// drops lower-priority labels that would overlap a higher-priority one.

import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

const v = new Vector3()
const starV = new Vector3()

/**
 * @param {Object} props
 * @param {{ current: Map<string, HTMLElement> }} props.labelRefs
 * @param {{ id: string, getAnchor: () => Vector3, priority: number }[]} props.anchors  higher priority wins
 * @param {number} props.starRadius
 */
export function LabelProjector({ labelRefs, anchors, starRadius }) {
  const size = useThree((s) => s.size)

  useFrame(({ camera }) => {
    const placed = []
    // Star's screen-space disc, for occlusion of planets behind it.
    starV.set(0, 0, 0).project(camera)
    const starDist = camera.position.length()
    const starPx = (starRadius / starDist) * (size.height / 2) / Math.tan((camera.fov * Math.PI) / 360)
    const sx = (starV.x * 0.5 + 0.5) * size.width
    const sy = (-starV.y * 0.5 + 0.5) * size.height

    const items = []
    for (const a of anchors) {
      const el = labelRefs.current.get(a.id)
      if (!el) continue
      const world = a.getAnchor()
      const camDist = camera.position.distanceTo(world)
      v.copy(world).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      const behindStar = camDist > starDist && Math.hypot(x - sx, y - sy) < starPx * 1.05
      const visible = v.z < 1 && !behindStar && x > -50 && x < size.width + 50 && y > -20 && y < size.height + 20
      items.push({ a, el, x, y, visible, w: el.offsetWidth, h: el.offsetHeight })
    }

    items.sort((p, q) => q.a.priority - p.a.priority)
    for (const it of items) {
      const rect = { l: it.x - it.w / 2, r: it.x + it.w / 2, t: it.y - it.h, b: it.y }
      const overlaps = placed.some((p) => rect.l < p.r && rect.r > p.l && rect.t < p.b && rect.b > p.t)
      const show = it.visible && !overlaps
      if (show) placed.push(rect)
      it.el.style.transform = `translate3d(${Math.round(it.x - it.w / 2)}px, ${Math.round(it.y - it.h)}px, 0)`
      it.el.style.opacity = show ? '1' : '0'
      it.el.style.pointerEvents = show ? 'auto' : 'none'
    }
  })

  return null
}
