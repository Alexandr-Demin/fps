import { Suspense, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Vector3,
} from 'three'
import { Billboard, Text } from '@react-three/drei'
import {
  CapsuleCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import type { PlayerSnap } from '@shared/protocol'
import { MP_MAX_HP } from '@shared/protocol'
import { HITBOX, HITBOX_CROUCH, PLAYER, REMOTE_POSE } from '../../core/constants'
import { useGameStore } from '../../state/gameStore'
import {
  registerRemotePlayerCollider,
  unregisterRemotePlayerCollider,
} from '../combat/hitscan'
import { CharacterModel } from '../character/CharacterModel'

// Module-level map of remote-player-id → performance.now() of the latest
// shot. NetClient writes here when a `shotFired` event arrives; each
// RemotePlayer reads its own entry in useFrame to drive a muzzle-flash
// decay. Stored outside the zustand store to avoid re-renders on every
// shot.
const remoteShotFiredAt = new Map<string, number>()
const MUZZLE_FLASH_DURATION = 0.07 // seconds, matches local ViewModel

export function triggerRemoteMuzzleFlash(playerId: string) {
  remoteShotFiredAt.set(playerId, performance.now())
}

export function RemotePlayer({ snap }: { snap: PlayerSnap }) {
  const visualRef = useRef<Group>(null!)
  const poseRef = useRef<Group>(null!)
  const nicknameRef = useRef<Group>(null!)
  const hpbarRef = useRef<Group>(null!)
  const bodyRef = useRef<RapierRigidBody>(null!)
  const colliderHandleRef = useRef<number | null>(null)
  const hpFillRef = useRef<Mesh>(null!)
  const flashMeshRef = useRef<Mesh>(null!)
  const flashLightRef = useRef<PointLight>(null!)
  const showHitboxes = useGameStore((s) => s.showHitboxes)

  const target = useRef(new Vector3(snap.pos[0], snap.pos[1], snap.pos[2]))
  const yawTarget = useRef(snap.yaw)
  // Visual horizontal speed (m/s), smoothed across frames so the
  // walk↔run threshold doesn't jitter from one snapshot's lerp tail.
  // Fed to CharacterModel through a ref to avoid forcing a re-render
  // every frame.
  const speedRef = useRef(0)
  const lastPos = useRef(new Vector3(snap.pos[0], snap.pos[1], snap.pos[2]))
  // Capsule top in world-space depends on the current pose. Used to keep
  // the nickname / HP bar billboards just above the visible silhouette
  // when the target crouches.
  const NAMETAG_STAND_Y = PLAYER.HEIGHT * 0.5 + 0.25
  const NAMETAG_CROUCH_Y =
    PLAYER.HEIGHT * 0.5 * REMOTE_POSE.CROUCH_VISUAL_SCALE +
    REMOTE_POSE.CROUCH_VISUAL_Y_SHIFT +
    0.25

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

    // Visible horizontal speed for the animation state machine. We
    // take it off the post-lerp visual position rather than off the
    // raw snap so the value is stable between snapshots. EMA smooth
    // so a brief stall doesn't flap walk↔idle.
    const cur = g.position
    const sdx = cur.x - lastPos.current.x
    const sdz = cur.z - lastPos.current.z
    const inst = Math.hypot(sdx, sdz) / Math.max(0.001, dt)
    speedRef.current = speedRef.current * 0.8 + inst * 0.2
    lastPos.current.set(cur.x, cur.y, cur.z)

    // Pose lerp — squash + drop the inner pose group when the remote is
    // crouching or sliding, tilt forward additionally while sliding. Feet
    // stay on the ground because Y_SHIFT mirrors the height loss.
    const pose = poseRef.current
    if (pose) {
      const crouched = snap.state === 'crouching' || snap.state === 'sliding'
      const targetScaleY = crouched ? REMOTE_POSE.CROUCH_VISUAL_SCALE : 1
      const targetPosY = crouched ? REMOTE_POSE.CROUCH_VISUAL_Y_SHIFT : 0
      const targetTilt = snap.state === 'sliding' ? -REMOTE_POSE.SLIDE_TILT : 0
      const pk = Math.min(1, dt * REMOTE_POSE.POSE_LERP_RATE)
      pose.scale.y += (targetScaleY - pose.scale.y) * pk
      pose.position.y += (targetPosY - pose.position.y) * pk
      pose.rotation.x += (targetTilt - pose.rotation.x) * pk
    }

    // Drop the nickname / HP bar with the pose so they don't float above
    // an obviously-crouched silhouette.
    const crouched = snap.state === 'crouching' || snap.state === 'sliding'
    const targetNickY = crouched ? NAMETAG_CROUCH_Y : NAMETAG_STAND_Y
    const targetHpY = targetNickY + 0.30
    const pk = Math.min(1, dt * REMOTE_POSE.POSE_LERP_RATE)
    if (nicknameRef.current) {
      nicknameRef.current.position.y +=
        (targetNickY - nicknameRef.current.position.y) * pk
    }
    if (hpbarRef.current) {
      hpbarRef.current.position.y +=
        (targetHpY - hpbarRef.current.position.y) * pk
    }

    // HP fill: scale from left edge (matches Bot's HP-bar convention).
    if (hpFillRef.current) {
      hpFillRef.current.scale.x = hpRatio
      hpFillRef.current.position.x = -0.35 * (1 - hpRatio)
    }

    // (Spawn-protection flicker is handled inside CharacterModel
    // — it drives opacity through every SkinnedMesh material.)

    // Muzzle flash decay — driven by the timestamp NetClient writes on
    // `shotFired`. Mirrors the local ViewModel flash duration so SP/MP
    // visuals match.
    const lastShot = remoteShotFiredAt.get(snap.id)
    if (lastShot != null) {
      const age = (performance.now() - lastShot) / 1000
      const k = Math.max(0, 1 - age / MUZZLE_FLASH_DURATION)
      if (flashMeshRef.current) {
        ;(flashMeshRef.current.material as MeshBasicMaterial).opacity = k
      }
      if (flashLightRef.current) {
        flashLightRef.current.intensity = k * 6
      }
      if (k <= 0) remoteShotFiredAt.delete(snap.id)
    }
  })

  // Clean up on unmount so a stale timestamp doesn't outlive the player.
  useEffect(() => {
    const id = snap.id
    return () => { remoteShotFiredAt.delete(id) }
  }, [snap.id])

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
        {/* Pose-driven inner group — squashed, dropped and (for slide)
            tilted by useFrame based on snap.state. Capsule, muzzle flash
            and hitbox-debug all live here so the visual silhouette and
            the debug zones stay in sync. */}
        <group ref={poseRef}>
          {/* Skinned humanoid model with locomotion clips. Wrapped in
              Suspense so the first remote-player mount doesn't crash
              the render tree while the ~5MB of FBX assets stream in
              — the player slot just stays empty until the cache is
              warm, then every subsequent mount is instant. */}
          <Suspense fallback={null}>
            <CharacterModel
              state={snap.state}
              speedRef={speedRef}
              isBot={snap.isBot}
              protectedFlag={snap.protected}
            />
          </Suspense>

          {/* Muzzle flash — opacity/intensity driven by useFrame above. Sits
              in front of the capsule at hand height; the parent group's
              rotation.y matches the player's yaw so the flash points where
              they're aiming. */}
          <mesh
            ref={flashMeshRef}
            position={[0.18, 0.05, -0.45]}
            renderOrder={1001}
          >
            <planeGeometry args={[0.28, 0.28]} />
            <meshBasicMaterial
              color="#ffb070"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            ref={flashLightRef}
            position={[0.18, 0.05, -0.45]}
            intensity={0}
            distance={4}
            color="#ffaa66"
            decay={2}
          />

        </group>

        {/* Debug hitbox wireframes — sit outside poseRef so the centers/
            sizes in HITBOX_CROUCH (which already encode the squash-and-
            shift in world-frame terms) aren't double-applied by the
            parent transform. The table flips by state so the boxes
            mirror what Weapon.tsx uses to resolve a hit. */}
        {showHitboxes && (() => {
          const table =
            snap.state === 'crouching' || snap.state === 'sliding'
              ? HITBOX_CROUCH
              : HITBOX
          return (
            <group>
              {[table.HEAD, table.TORSO, table.LEGS].map((zone, i) => (
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
          )
        })()}

        {/* Nickname — sits outside poseRef so it follows the silhouette top
            (dropped via nicknameRef.position.y in useFrame) without being
            tilted by the slide pose. */}
        <group ref={nicknameRef} position={[0, NAMETAG_STAND_Y, 0]}>
          <Billboard>
            <Text
              fontSize={0.22}
              color={snap.isBot ? '#a8b0bd' : '#ffffff'}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              {snap.isBot ? `[BOT] ${snap.nickname}` : snap.nickname}
            </Text>
          </Billboard>
        </group>

        {/* HP bar above nickname */}
        <group ref={hpbarRef} position={[0, NAMETAG_STAND_Y + 0.30, 0]}>
          <Billboard>
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
      </group>
    </>
  )
}
