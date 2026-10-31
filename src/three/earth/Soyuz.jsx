// Soyuz-inspired spacecraft, built from primitives — owner: LEAD.
//
// An illustration, not a replica: proportions follow the published Soyuz MS
// layout (≈7.5 m long, ≈2.7 m service-module diameter, ≈10.6 m across the
// solar arrays) so the silhouette reads as Soyuz — spherical orbital module,
// bell-shaped descent module, cylindrical service module with two long
// arrays. No agency marks. Local axes (metres): +Z = nose (orbital module),
// +X = along the solar arrays, +Y = solar-array face normal.

import { useEffect, useMemo } from 'react'
import { CanvasTexture, CylinderGeometry, DoubleSide, LatheGeometry, MeshStandardMaterial, SRGBColorSpace, SphereGeometry, TorusGeometry, Vector2 } from 'three'

/** Solar-array face: dark cells in a silver frame (generated, no image asset). */
function solarCellTexture() {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#c3c8ce' // silver frame and bus bars
  g.fillRect(0, 0, 256, 128)
  const cols = 12
  const rows = 6
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const shade = 34 + ((i * 7 + j * 13) % 5) * 4
      g.fillStyle = `rgb(${shade - 4}, ${shade + 18}, ${shade + 70})` // deep blue silicon cells
      g.fillRect(3 + i * (250 / cols), 3 + j * (122 / rows), 250 / cols - 2.5, 122 / rows - 2.5)
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function useSoyuzParts() {
  const parts = useMemo(() => {
    const blanket = new MeshStandardMaterial({ color: '#7d846f', roughness: 0.8, metalness: 0.05 }) // green-grey thermal blanket
    const radiator = new MeshStandardMaterial({ color: '#d6d9d2', roughness: 0.55, metalness: 0.1 })
    const heatShield = new MeshStandardMaterial({ color: '#3b3630', roughness: 0.9, metalness: 0.0 })
    // Low metalness: without an environment map, metallic surfaces would render almost black.
    const metal = new MeshStandardMaterial({ color: '#b9bdc2', roughness: 0.4, metalness: 0.3 })
    const dark = new MeshStandardMaterial({ color: '#3a3d42', roughness: 0.5, metalness: 0.25 })
    const cells = solarCellTexture()
    const panel = new MeshStandardMaterial({ map: cells, color: '#ffffff', roughness: 0.24, metalness: 0.15, side: DoubleSide })
    const panelBack = new MeshStandardMaterial({ color: '#d8dbdf', roughness: 0.55, metalness: 0.2 })

    // Descent module: "headlight" bell, narrow towards the orbital module.
    const dmProfile = [
      [0.5, 1.72], [0.82, 1.62], [0.98, 1.3], [1.06, 0.8], [1.1, 0.2], [1.1, -0.38], [0.98, -0.5], [0.0, -0.52],
    ]
      .reverse() // LatheGeometry wants the profile bottom → top for outward-facing normals
      .map(([r, y]) => new Vector2(r, y))
    const geos = {
      om: new SphereGeometry(1.1, 32, 20),
      dm: new LatheGeometry(dmProfile, 40),
      neck: new CylinderGeometry(0.62, 0.62, 0.3, 28),
      instrument: new CylinderGeometry(1.1, 1.1, 0.55, 36),
      flare: new CylinderGeometry(1.1, 1.36, 0.3, 36),
      propulsion: new CylinderGeometry(1.36, 1.36, 1.55, 40, 1, true),
      aftCap: new CylinderGeometry(1.36, 1.2, 0.12, 40),
      radiatorBand: new CylinderGeometry(1.375, 1.375, 0.42, 40, 1, true),
      nozzle: new CylinderGeometry(0.18, 0.42, 0.45, 24, 1, true),
      probe: new CylinderGeometry(0.05, 0.07, 0.55, 10),
      probeTip: new CylinderGeometry(0.0, 0.09, 0.16, 10),
      collar: new TorusGeometry(0.42, 0.05, 10, 32),
      rod: new CylinderGeometry(0.02, 0.02, 1, 6),
      dish: new CylinderGeometry(0.16, 0.16, 0.02, 20),
      boom: new CylinderGeometry(0.06, 0.06, 0.55, 8),
    }
    return { mats: { blanket, radiator, heatShield, metal, dark, panel, panelBack }, geos, cells }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts.geos).forEach((g) => g.dispose())
      Object.values(parts.mats).forEach((m) => m.dispose())
      parts.cells?.dispose()
    },
    [parts],
  )
  return parts
}

// Cylinder/lathe geometries are built along +Y; this turns +Y to +Z (a cylinder's top radius faces the nose).
const ALONG_Z = [Math.PI / 2, 0, 0]
const PANELS_PER_WING = 4
const PANEL_W = 0.92 // along X
const PANEL_H = 1.32 // along Z
const PANEL_GAP = 0.05

function Wing({ side, mats }) {
  const x0 = side * 1.36
  return (
    <group position={[x0, 0, -1.75]}>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[side * 0.27, 0, 0]} material={mats.metal}>
        <cylinderGeometry args={[0.05, 0.05, 0.55, 8]} />
      </mesh>
      {Array.from({ length: PANELS_PER_WING }, (_, i) => {
        const cx = side * (0.55 + PANEL_W / 2 + i * (PANEL_W + PANEL_GAP))
        return (
          <group key={i} position={[cx, 0, 0]}>
            <mesh material={mats.panel} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[PANEL_W, PANEL_H]} />
            </mesh>
            <mesh material={mats.panelBack}>
              <boxGeometry args={[PANEL_W, 0.02, PANEL_H]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** @param {{ scale?: number }} props */
export default function Soyuz({ scale = 1, ...props }) {
  const { mats, geos } = useSoyuzParts()
  return (
    <group scale={scale} {...props}>
      {/* Orbital module (slightly elongated sphere) with docking probe and Kurs antennas */}
      <mesh geometry={geos.om} material={mats.blanket} position={[0, 0, 2.95]} scale={[1, 1, 1.18]} />
      <mesh geometry={geos.collar} material={mats.metal} position={[0, 0, 4.22]} />
      <mesh geometry={geos.probe} material={mats.metal} position={[0, 0, 4.5]} rotation={ALONG_Z} />
      <mesh geometry={geos.probeTip} material={mats.metal} position={[0, 0, 4.85]} rotation={ALONG_Z} />
      {[1, -1].map((s) => (
        <group key={s} position={[s * 0.62, 0.62, 3.4]} rotation={[0, 0, -s * 0.7]}>
          <mesh geometry={geos.rod} material={mats.metal} scale={[1, 0.9, 1]} position={[0, 0.45, 0]} />
          <mesh geometry={geos.dish} material={mats.metal} position={[0, 0.92, 0]} />
        </group>
      ))}
      {/* Hatch neck between orbital and descent modules */}
      <mesh geometry={geos.neck} material={mats.metal} position={[0, 0, 1.78]} rotation={ALONG_Z} />
      {/* Descent module (bell) and heat shield */}
      <mesh geometry={geos.dm} material={mats.blanket} rotation={ALONG_Z} position={[0, 0, 0]} />
      <mesh material={mats.heatShield} position={[0, 0, -0.5]} rotation={ALONG_Z}>
        <cylinderGeometry args={[0.99, 0.99, 0.06, 36]} />
      </mesh>
      {/* Service module: instrument compartment, flare, propulsion compartment, radiators, engine */}
      <mesh geometry={geos.instrument} material={mats.blanket} position={[0, 0, -0.82]} rotation={ALONG_Z} />
      <mesh geometry={geos.flare} material={mats.blanket} position={[0, 0, -1.24]} rotation={ALONG_Z} />
      <mesh geometry={geos.propulsion} material={mats.blanket} position={[0, 0, -2.16]} rotation={ALONG_Z} />
      <mesh geometry={geos.radiatorBand} material={mats.radiator} position={[0, 0, -1.72]} rotation={ALONG_Z} />
      <mesh geometry={geos.radiatorBand} material={mats.radiator} position={[0, 0, -2.6]} rotation={ALONG_Z} />
      <mesh geometry={geos.aftCap} material={mats.dark} position={[0, 0, -2.99]} rotation={ALONG_Z} />
      <mesh geometry={geos.nozzle} material={mats.dark} position={[0, 0, -3.25]} rotation={ALONG_Z} />
      {[1, -1].map((s) => (
        <mesh key={s} geometry={geos.rod} material={mats.metal} position={[s * 0.9, -1.15, -2.4]} rotation={[0.5, 0, s * 0.5]} scale={[1, 1.1, 1]} />
      ))}
      <Wing side={1} mats={mats} />
      <Wing side={-1} mats={mats} />
    </group>
  )
}
