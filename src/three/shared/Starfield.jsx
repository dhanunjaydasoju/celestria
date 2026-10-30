// Deep-space background — owner: LEAD. One THREE.Points draw call: a sparse
// uniform field plus a denser, dimmer galactic band. Seeded, so the sky is
// identical on every visit. Star colours follow blackbody hues (desaturated).

import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import { blackbodyRGB } from '../star/starColor.js'

const vertex = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragment = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = exp(-d * 3.5);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildGeometry(count, radius, seed, dpr) {
  const rand = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const size = new Float32Array(count)
  // Galactic plane tilted ~60° to the scene's orbital plane.
  const tilt = 1.05
  for (let i = 0; i < count; i++) {
    const inBand = rand() < 0.45
    const lon = rand() * Math.PI * 2
    // Band stars cluster near latitude 0 (approximate Gaussian).
    const lat = inBand ? (rand() + rand() + rand() - 1.5) * 0.18 : Math.asin(rand() * 2 - 1)
    let x = Math.cos(lat) * Math.cos(lon)
    let y = Math.sin(lat)
    let z = Math.cos(lat) * Math.sin(lon)
    ;[y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)]
    pos.set([x * radius, y * radius, z * radius], i * 3)

    const mag = rand() ** 3 // most stars faint, a few bright
    const bright = (inBand ? 0.35 : 0.5) + mag * 1.4
    const [r, g, b] = blackbodyRGB(3200 + rand() ** 1.5 * 9000)
    const desat = 0.6
    col.set([(r + (1 - r) * desat) * bright, (g + (1 - g) * desat) * bright, (b + (1 - b) * desat) * bright], i * 3)
    size[i] = (inBand ? 1.1 : 1.4 + mag * 2.2) * dpr
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new BufferAttribute(col, 3))
  geo.setAttribute('aSize', new BufferAttribute(size, 1))
  return geo
}

/** @param {{ count?: number, radius?: number, seed?: number }} props */
export default function Starfield({ count = 6000, radius = 600, seed = 7 }) {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const geometry = useMemo(() => buildGeometry(count, radius, seed, dpr), [count, radius, seed, dpr])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  return <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
}
