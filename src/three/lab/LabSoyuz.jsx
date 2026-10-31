// Dev-only close-up of the Soyuz-inspired spacecraft — owner: LEAD.
// Same materials and lights as the homepage scene, with orbit controls.

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import Soyuz from '../earth/Soyuz.jsx'
import { SPACE_BACKGROUND } from '../shared/space.js'

export default function LabSoyuz() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas camera={{ position: [9, 4, 9], fov: 35 }} dpr={[1, 2]}>
        <color attach="background" args={[SPACE_BACKGROUND]} />
        <directionalLight position={[-20, 8, 10]} intensity={3.1} color="#fff6ea" />
        <hemisphereLight args={['#1b2233', '#6f8fc8', 0.55]} />
        <ambientLight intensity={0.12} color="#7d97c6" />
        <Soyuz />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  )
}
