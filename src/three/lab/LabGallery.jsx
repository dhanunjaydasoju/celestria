// Lab-only: every fixture in one canvas, to compare archetypes side by side —
// owner: LEAD. One WebGL context regardless of how many planets.

import { Html, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import ProceduralPlanet from '../planet/ProceduralPlanet.jsx'
import { visualParams } from '../planet/visualParams.js'

const COLS = 4
const GAP = 2.7
const LIGHT_OFFSET = [-10, 3, 3.5]

export default function LabGallery({ planets, onPick }) {
  const items = useMemo(
    () =>
      planets.map((planet, i) => {
        const row = Math.floor(i / COLS)
        const col = i % COLS
        const position = [(col - (COLS - 1) / 2) * GAP, -(row - (Math.ceil(planets.length / COLS) - 1) / 2) * GAP, 0]
        return {
          planet,
          params: visualParams(planet),
          position,
          light: position.map((v, k) => v + LIGHT_OFFSET[k]),
        }
      }),
    [planets],
  )
  const rows = Math.ceil(planets.length / COLS)

  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 6 + rows * 2.6], fov: 40 }}>
      {items.map(({ planet, params, position, light }) => (
        <group key={planet.id}>
          <ProceduralPlanet
            params={params}
            detail="card"
            position={position}
            lightPosition={light}
            onClick={() => onPick(planet.id)}
          />
          <Html position={[position[0], position[1] - 1.3, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{ whiteSpace: 'nowrap', textAlign: 'center', fontSize: 11, lineHeight: 1.3 }}>
              <div>{planet.name}</div>
              <div style={{ color: 'var(--color-text-muted)' }}>
                {params.archetypeLabel} · {params.thermalLabel}
              </div>
            </div>
          </Html>
        </group>
      ))}
      <OrbitControls enableRotate={false} enableDamping />
    </Canvas>
  )
}
