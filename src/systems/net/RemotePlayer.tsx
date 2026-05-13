import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { Billboard, Text } from '@react-three/drei'
import type { PlayerSnap } from '@shared/protocol'

export function RemotePlayer({ snap }: { snap: PlayerSnap }) {
  const groupRef = useRef<Group>(null!)
  const target = useRef(new Vector3(snap.pos[0], snap.pos[1], snap.pos[2]))
  const yawTarget = useRef(snap.yaw)

  // refresh interpolation targets on every render (snap prop updates)
  target.current.set(snap.pos[0], snap.pos[1], snap.pos[2])
  yawTarget.current = snap.yaw

  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    const k = Math.min(1, dt * 12)
    g.position.lerp(target.current, k)
    let dy = yawTarget.current - g.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    g.rotation.y += dy * k
  })

  return (
    <group ref={groupRef} position={snap.pos}>
      <mesh castShadow>
        <capsuleGeometry args={[0.35, 1.1, 6, 12]} />
        <meshStandardMaterial color="#3a8aff" roughness={0.6} metalness={0.2} />
      </mesh>
      <Billboard position={[0, 1.4, 0]}>
        <Text
          fontSize={0.22}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {snap.nickname}
        </Text>
      </Billboard>
    </group>
  )
}
