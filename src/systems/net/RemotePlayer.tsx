import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, Vector3 } from 'three'
import { Billboard, Text } from '@react-three/drei'
import {
  CapsuleCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import type { PlayerSnap } from '@shared/protocol'
import { MP_MAX_HP } from '@shared/protocol'
import { HITBOX, PLAYER } from '../../core/constants'
import { useGameStore } from '../../state/gameStore'
import {
  registerRemotePlayerCollider,
  unregisterRemotePlayerCollider,
} from '../combat/hitscan'

export function RemotePlayer({ snap }: { snap: PlayerSnap }) {
  const visualRef = useRef<Group>(null!)
  const bodyRef = useRef<RapierRigidBody>(null!)
  const colliderHandleRef = useRef<number | null>(null)
  const hpFillRef = useRef<Mesh>(null!)
  const showHitboxes = useGameStore((s) => s.showHitboxes)

  const target = useRef(new Vector3(snap.pos[0], snap.pos[1], snap.pos[2]))
  const yawTarget = useRef(snap.yaw)

  // Refresh interpolation targets each render (props change every snapshot)
  target.current.set(snap.pos[0], snap.pos[1], snap.pos[2])
  yawTarget.current = snap.yaw

  // Register the capsule collider so local hitscan can identify hits on this
  // player. We can't access `body.collider(0)` synchronously during render —
  // the body is mounted by @react-three/rapier in an effect — so defer one
  // tick.
  useEffect(() => {
    const id = setTimeout(() => {
      const c = bodyRef.current?.collider(0)
      if (!c) return
      const handle = (c as any).handle as number
      registerRemotePlayerCollider(handle, snap.id)
      colliderHandleRef.current = handle
    }, 0)
    return () => {
      clearTimeout(id)
      if (colliderHandleRef.current != null) {
        unregisterRemotePlayerCollider(colliderHandleRef.current)
        colliderHandleRef.current = null
      }
    }
  }, [snap.id])

  // HP-bar scaling — driven by the latest snap; the actual mesh scale is
  // applied in useFrame to keep it consistent with the body position update.
  const hp = snap.hp ?? MP_MAX_HP
  const hpRatio = Math.max(0, Math.min(1, hp / MP_MAX_HP))
  const hpLow = hpRatio < 0.35

  useFrame((_, dt) => {
    const g = visualRef.current
    if (!g) return
    const k = Math.min(1, dt * 12)
    g.position.lerp(target.current, k)
    // Yaw lerp with ±π wrap-around handling
    let dy = yawTarget.current - g.rotation.y
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    g.rotation.y += dy * k

    // Keep the sensor collider co-located with the visual capsule so hitscan
    // hits exactly where the player sees the body.
    if (bodyRef.current) {
      const p = g.position
      bodyRef.current.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
    }

    // HP fill: scale from left edge (matches Bot's HP-bar convention).
    if (hpFillRef.current) {
      hpFillRef.current.scale.x = hpRatio
      hpFillRef.current.position.x = -0.35 * (1 - hpRatio)
    }
  })

  return (
    <>
      {/* Sensor collider — raycast-hittable, doesn't physically block the
          local player's character controller. */}
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={snap.pos}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider
          args={[PLAYER.HEIGHT * 0.5 - PLAYER.RADIUS, PLAYER.RADIUS]}
          sensor
        />
      </RigidBody>

      <group ref={visualRef} position={snap.pos}>
        <mesh castShadow>
          <capsuleGeometry args={[PLAYER.RADIUS, PLAYER.HEIGHT - PLAYER.RADIUS * 2, 6, 12]} />
          <meshStandardMaterial color="#3a8aff" roughness={0.6} metalness={0.2} />
        </mesh>

        {/* Debug hitbox wireframes — toggled from settings dialog. Mirrors
            the Bot.tsx debug overlay (same HITBOX table, same Y convention
            relative to body center). */}
        {showHitboxes && (
          <group>
            {[HITBOX.HEAD, HITBOX.TORSO, HITBOX.LEGS].map((zone, i) => (
              <mesh key={i} position={zone.center as unknown as [number, number, number]}>
                <boxGeometry args={zone.size as unknown as [number, number, number]} />
                <meshBasicMaterial
                  color={zone.color}
                  wireframe
                  transparent
                  opacity={0.75}
                  depthTest={false}
                  toneMapped={false}
                />
              </mesh>
            ))}
          </group>
        )}

        {/* Nickname */}
        <Billboard position={[0, PLAYER.HEIGHT * 0.5 + 0.25, 0]}>
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

        {/* HP bar above nickname */}
        <Billboard position={[0, PLAYER.HEIGHT * 0.5 + 0.55, 0]}>
          {/* Background */}
          <mesh position={[0, 0, -0.002]} renderOrder={10}>
            <planeGeometry args={[0.78, 0.12]} />
            <meshBasicMaterial
              color="#000"
              transparent
              opacity={0.75}
              depthTest={false}
            />
          </mesh>
          {/* Track */}
          <mesh position={[0, 0, -0.001]} renderOrder={11}>
            <planeGeometry args={[0.7, 0.06]} />
            <meshBasicMaterial color="#2a2d33" depthTest={false} />
          </mesh>
          {/* Fill — scaled in useFrame */}
          <mesh ref={hpFillRef} position={[0, 0, 0]} renderOrder={12}>
            <planeGeometry args={[0.7, 0.06]} />
            <meshBasicMaterial
              color={hpLow ? '#ff3030' : '#dfe6f0'}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      </group>
    </>
  )
}
