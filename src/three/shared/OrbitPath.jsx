// Circular orbit guide in the XZ plane — owner: LEAD.
// Line style encodes how the distance was obtained (see SystemViewport legend):
// solid = NASA archive, dashed = Kepler's third law, dotted = arbitrary.

import { Line } from '@react-three/drei'
import { useMemo } from 'react'

const SEGMENTS = 256

const STYLES = {
  catalog: { dashed: false },
  kepler: { dashed: true, dashSize: 0.35, gapSize: 0.22 },
  arbitrary: { dashed: true, dashSize: 0.06, gapSize: 0.22 },
}

/**
 * @param {{ radius: number, source: 'catalog'|'kepler'|'arbitrary', emphasis?: 0|1|2 }} props
 *   emphasis: 0 normal, 1 hovered, 2 selected
 */
export default function OrbitPath({ radius, source, emphasis = 0 }) {
  const points = useMemo(() => {
    const pts = []
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      pts.push([Math.cos(a) * radius, 0, -Math.sin(a) * radius])
    }
    return pts
  }, [radius])
  const style = STYLES[source] ?? STYLES.catalog

  return (
    <Line
      points={points}
      color={emphasis === 2 ? '#8fd3e8' : '#c9d6e8'}
      lineWidth={emphasis ? 1.4 : 1}
      transparent
      opacity={emphasis === 2 ? 0.75 : emphasis === 1 ? 0.45 : 0.16}
      depthWrite={false}
      raycast={() => null}
      {...style}
    />
  )
}
