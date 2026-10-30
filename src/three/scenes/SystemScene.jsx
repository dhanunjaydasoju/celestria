// One planetary system: star, orbits, procedural planets — owner: LEAD.
// Scene-level (inside <Canvas>). All inputs are props; see SystemViewport.

import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { fitDistance } from '../camera/framing.js'
import ProceduralPlanet from '../planet/ProceduralPlanet.jsx'
import CameraRig from '../shared/CameraRig.jsx'
import OrbitPath from '../shared/OrbitPath.jsx'
import { LabelProjector } from '../shared/ScreenLabels.jsx'
import Starfield from '../shared/Starfield.jsx'
import Star from '../star/Star.jsx'
import { orbitAngle } from '../system/systemModel.js'

const ORIGIN = [0, 0, 0]
const ELEVATION = (32 * Math.PI) / 180
const anchorV = new Vector3()

/**
 * @param {Object} props
 * @param {ReturnType<typeof import('../system/systemModel.js').buildSystemModel>} props.model
 * @param {string|null} props.selectedId
 * @param {string|null} props.hoveredId
 * @param {(id: string|null) => void} props.onSelect
 * @param {(id: string|null) => void} props.onHover
 * @param {boolean} props.paused
 * @param {number} props.timeScale
 * @param {number} props.resetToken
 * @param {boolean} props.reducedMotion
 * @param {{ current: Map<string, HTMLElement> }} props.labelRefs
 */
export default function SystemScene({
  model,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  paused,
  timeScale,
  resetToken,
  reducedMotion,
  labelRefs,
}) {
  const groups = useRef(new Map())
  const simTime = useRef(0)
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const fov = useThree((s) => s.camera.fov)

  const overviewDistance = fitDistance(model.outerRadius, fov, aspect, 1.12) ?? 20
  const overviewPosition = useMemo(
    () => [0, Math.sin(ELEVATION) * overviewDistance, Math.cos(ELEVATION) * overviewDistance],
    [overviewDistance],
  )
  const selected = model.planets.find((p) => p.id === selectedId) ?? null

  // Invisible hit targets: generous for small planets, but capped below half
  // the gap to the neighbouring orbits so targets never overlap.
  const hitRadii = useMemo(
    () =>
      model.planets.map((p, i, all) => {
        const gaps = [all[i - 1], all[i + 1]].filter(Boolean).map((n) => Math.abs(n.orbitRadius - p.orbitRadius))
        const cap = gaps.length ? Math.min(...gaps) * 0.45 : Infinity
        return Math.max(p.displayRadius * 1.3, Math.min(overviewDistance * 0.022, cap))
      }),
    [model, overviewDistance],
  )
  // Focused planet fills ~40% of the narrower viewport dimension.
  const focusDistance = selected ? fitDistance(selected.displayRadius * 2.5, fov, aspect, 1) : 0

  useFrame((_, dt) => {
    if (!paused) simTime.current += Math.min(dt, 0.1) * timeScale
    for (const p of model.planets) {
      const g = groups.current.get(p.id)
      if (!g) continue
      const a = orbitAngle(p, simTime.current)
      g.position.set(Math.cos(a) * p.orbitRadius, 0, -Math.sin(a) * p.orbitRadius)
    }
  })

  const getFocus = useCallback(() => (selectedId ? groups.current.get(selectedId)?.position ?? null : null), [selectedId])

  const anchors = useMemo(
    () =>
      model.planets.map((p, i) => ({
        id: p.id,
        priority: p.id === selectedId ? 1000 : p.id === hoveredId ? 900 : model.planets.length - i,
        getAnchor: () => {
          const g = groups.current.get(p.id)
          return g ? anchorV.copy(g.position).setY(p.displayRadius * 1.25) : anchorV.set(0, 0, 0)
        },
      })),
    [model, selectedId, hoveredId],
  )

  return (
    <>
      <Starfield />
      <Star radius={model.star.displayRadius} color={model.star.color} seed={model.star.seed} />

      {model.planets.map((p) => (
        <OrbitPath
          key={`orbit-${p.id}`}
          radius={p.orbitRadius}
          source={p.distance.source}
          emphasis={p.id === selectedId ? 2 : p.id === hoveredId ? 1 : 0}
        />
      ))}

      {model.planets.map((p, i) => (
        <group
          key={p.id}
          ref={(g) => {
            if (g) groups.current.set(p.id, g)
            else groups.current.delete(p.id)
          }}
        >
          <ProceduralPlanet params={p.params} detail="system" radius={p.displayRadius} lightPosition={ORIGIN} spinSpeed={0.12} />
          {/* Larger invisible hit target so small planets are easy to click. */}
          <mesh
            onClick={(e) => {
              e.stopPropagation()
              onSelect(p.id)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              onHover(p.id)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              onHover(null)
              document.body.style.cursor = ''
            }}
          >
            <sphereGeometry args={[hitRadii[i], 16, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
      ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
        minDistance={0.8}
        maxDistance={overviewDistance * 2.5}
        maxPolarAngle={Math.PI * 0.85}
      />
      <CameraRig
        getFocus={getFocus}
        focusDistance={focusDistance}
        overviewPosition={overviewPosition}
        transitionKey={`${selectedId}|${resetToken}|${overviewDistance.toFixed(2)}`}
        instant={reducedMotion}
      />
      <LabelProjector labelRefs={labelRefs} anchors={anchors} starRadius={model.star.displayRadius} />
    </>
  )
}
