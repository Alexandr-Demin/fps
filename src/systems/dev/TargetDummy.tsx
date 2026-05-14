import { useEffect, useMemo, useRef } from 'react'
import { Group } from 'three'
import { Billboard, Text } from '@react-three/drei'
import {
  CapsuleCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import type { PlayerState } from '@shared/protocol'
import { HITBOX, HITBOX_CROUCH, PLAYER, REMOTE_POSE } from '../../core/constants'
import { useGameStore } from '../../state/gameStore'
import {
  registerDummyCollider,
  unregisterDummyCollider,
} from '../combat/hitscan'

interface Props {
  id: string
  pos: [number, number, number]
  state: PlayerState
  yaw?: number
  label?: string
}

/**
 * Static practice-range dummy. Mirrors the RemotePlayer silhouette logic
 * (squash + Y-shift for crouching, additional forward tilt for sliding)
 * but with no animation, no network input, and no damage path — Weapon
 * just logs the resolved hit zone into HitStats so the player can
 * verify that headshot / torso / leg zones land where the visual model
 * suggests. Map-data driven via `targetDummy` entities.
 */
export function TargetDummy({ id, pos, state, yaw = 0, label }: Props) {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const showHitboxes = useGameStore((s) => s.showHitboxes)

  const crouched = state === 'crouching' || state === 'sliding'
  const sliding = state === 'sliding'

  // Pose transform — precomputed (no lerp; dummies don't transition).
  const poseScaleY = crouched ? REMOTE_POSE.CROUCH_VISUAL_SCALE : 1
  const poseY = crouched ? REMOTE_POSE.CROUCH_VISUAL_Y_SHIFT : 0
  const poseTiltX = sliding ? -REMOTE_POSE.SLIDE_TILT : 0

  // Hitbox table used both for the wireframe overlay and (via the
  // registry below) for Weapon's hit-zone resolution. Same selection
  // rule as RemotePlayer / Weapon — keeps the practice rig honest.
  const table = crouched ? HITBOX_CROUCH : HITBOX

  // Register the sensor collider in the hitscan registry. Defers one
  // tick so @react-three/rapier has time to mount the collider.
  const handleRef = useRef<number | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      const c = bodyRef.current?.collider(0)
      if (!c) return
      const handle = (c as any).handle as number
      registerDummyCollider(handle, { id, centerY: pos[1], state })
      handleRef.current = handle
    }, 0)
    return () => {
      clearTimeout(t)
      if (handleRef.current != null) {
        unregisterDummyCollider(handleRef.current)
        handleRef.current = null
      }
    }
  }, [id, pos[0], pos[1], pos[2], state])

  const labelText = label ?? state.toUpperCase()
  const labelY = useMemo(
    () =>
      PLAYER.HEIGHT * 0.5 * poseScaleY + poseY + 0.75,
    [poseScaleY, poseY]
  )

  return (
    <>
      {/* Sensor — full standing height. Matches the RemotePlayer
          collider geometry so practice-range hits behave the same as
          MP hits. Hit-zone math handles the squash. */}
      <RigidBody
        ref={bodyRef}
        type="fixed"
        colliders={false}
        position={pos}
      >
        <CapsuleCollider
          args={[PLAYER.HEIGHT * 0.5 - PLAYER.RADIUS, PLAYER.RADIUS]}
          sensor
        />
      </RigidBody>

      <group position={pos} rotation={[0, yaw, 0]}>
        {/* Posed inner group — silhouette */}
        <group
          scale={[1, poseScaleY, 1]}
          position={[0, poseY, 0]}
          rotation={[poseTiltX, 0, 0]}
        >
          <mesh castShadow>
            <capsuleGeometry args={[PLAYER.RADIUS, PLAYER.HEIGHT - PLAYER.RADIUS * 2, 6, 12]} />
            <meshStandardMaterial color="#7a8a9a" roughness={0.7} metalness={0.1} />
          </mesh>
        </group>

        {/* Debug wireframe — out of pose group so HITBOX_CROUCH's
            already-shifted coords aren't double-transformed. */}
        {showHitboxes && (
          <group>
            {[table.HEAD, table.TORSO, table.LEGS].map((zone, i) => (
              <mesh
                key={i}
                position={zone.center as unknown as [number, number, number]}
              >
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

        {/* State label hovering above the silhouette */}
        <Billboard position={[0, labelY, 0]}>
          <Text
            fontSize={0.22}
            color="#ffd070"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {labelText}
          </Text>
        </Billboard>
      </group>
    </>
  )
}

/**
 * Renders every `targetDummy` entity in the active map. Mount this from
 * Scene.tsx for SP gameplay — it's a no-op on maps without dummies.
 */
export function TargetDummies({
  entities,
}: {
  entities: Array<{
    id: string
    kind: string
    pos: [number, number, number]
    state?: PlayerState
    yaw?: number
    label?: string
  }>
}) {
  const dummies = useMemo(
    () => entities.filter((e) => e.kind === 'targetDummy'),
    [entities]
  )
  return (
    <>
      {dummies.map((d) => (
        <TargetDummy
          key={d.id}
          id={d.id}
          pos={d.pos}
          state={(d.state ?? 'standing') as PlayerState}
          yaw={d.yaw}
          label={d.label}
        />
      ))}
    </>
  )
}
