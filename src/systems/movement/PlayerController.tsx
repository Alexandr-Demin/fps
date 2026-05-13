import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Euler, Vector3 } from 'three'
import { PLAYER, CAMERA, COLLISION, WEAPON } from '../../core/constants'
import { Input } from '../input/input'
import { useGameStore } from '../../state/gameStore'
import { useNetStore } from '../../state/netStore'
import { AudioBus } from '../audio/AudioSystem'
import { filterByKind } from '../../core/mapTypes'
import { NetClient } from '../net/NetClient'
import {
  createPlayerCharacterController,
  createPlayerSimState,
  stepPlayer,
  type PlayerInputCmd,
  type PlayerSimState,
} from '@shared/sim/player-sim'
import { SIM_DT } from '@shared/sim/constants'

const FALLBACK_SPAWN: [number, number, number] = [0, 2.5, 0]

interface PlayerHandle {
  pos: Vector3
  vel: Vector3
  grounded: boolean
  yaw: number
  pitch: number
  lookDeltaYaw: number
  lookDeltaPitch: number
  body: RapierRigidBody | null
  // When non-null, PlayerController will hard-reset sim state to this
  // position on its next useFrame and clear it. Used by NetClient's
  // `respawned` handler so the local sim sees the new spawn immediately
  // rather than waiting for the first post-respawn snapshot.
  pendingTeleport: [number, number, number] | null
}

export const playerHandle: PlayerHandle = {
  pos: new Vector3(0, 2.5, 0),
  vel: new Vector3(),
  grounded: false,
  yaw: 0,
  pitch: 0,
  lookDeltaYaw: 0,
  lookDeltaPitch: 0,
  body: null,
  pendingTeleport: null,
}

export function PlayerController() {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const { world, rapier } = useRapier()
  const { camera } = useThree()

  // ===== Sim state =====
  // The single source of truth for the local player's physics. Mutated
  // by stepPlayer; mirrored to playerHandle for downstream systems
  // (weapon, hitscan, scene FX) that don't speak the shared sim API.
  const sim = useRef<PlayerSimState>(createPlayerSimState(FALLBACK_SPAWN))
  const localTick = useRef(0)
  const matchTime = useRef(0)
  const accumulator = useRef(0)
  const inputBuffer = useRef<PlayerInputCmd[]>([])
  const lastReconciledServerTick = useRef(0)
  // Render-time error vector for smooth reconciliation. On every reconcile,
  // (predicted − server) is added to this; the render position is
  // sim.pos + renderError, and renderError exponentially decays each frame
  // toward zero. Visual outcome: a subtle smooth slide back instead of a
  // hard rubber-band snap.
  const renderError = useRef(new Vector3())

  // ===== Camera / FX state (rendered every frame, NOT per sim tick) =====
  const eyeHeight = useRef(PLAYER.EYE_HEIGHT)
  const stepPhase = useRef(0)
  const fovTarget = useRef(CAMERA.FOV_BASE)
  const bobTime = useRef(0)
  const cameraTilt = useRef(0)
  const cameraBob = useRef(new Vector3())
  const cameraSway = useRef(new Vector3())
  const recoilPitch = useRef(0)
  const recoilYaw = useRef(0)
  const recoilPunch = useRef(new Vector3())
  const recoilPunchVel = useRef(new Vector3())
  const lastRecoilAt = useRef(-1)
  const prevYaw = useRef(0)
  const prevPitch = useRef(0)

  const phase = useGameStore((s) => s.phase)
  const killPlayer = useGameStore((s) => s.killPlayer)

  // ===== Rapier character controller (same params on client + server via
  // shared factory) =====
  const controller = useMemo(
    () => createPlayerCharacterController(rapier, world),
    [rapier, world],
  )

  useEffect(() => {
    return () => {
      try { world.removeCharacterController(controller) } catch {}
    }
  }, [world, controller])

  // Expose rigid body to other systems (hitscan filter, etc.)
  useEffect(() => {
    playerHandle.body = bodyRef.current
    return () => {
      playerHandle.body = null
    }
  }, [])

  // ===== Spawn / respawn =====
  // SP: random spawn from map's playerSpawn entities on real entry.
  // MP: server picks the spawn and we get it via the `respawned` event
  // in NetClient — which calls setTranslation directly. We still reset
  // simState here on MP entry so the buffer is empty.
  const prevPhaseRef = useRef<typeof phase | null>(null)
  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = phase

    const enteredSp = phase === 'playing' && prev !== 'paused'
    const enteredMp =
      phase === 'mpPlaying' && prev !== 'mpPaused' && prev !== 'mpDead'
    if (!enteredSp && !enteredMp) return

    const map = useGameStore.getState().currentMap
    const spawns = filterByKind(map.entities, 'playerSpawn')
    const spawn: [number, number, number] =
      spawns.length > 0
        ? spawns[Math.floor(Math.random() * spawns.length)].pos
        : FALLBACK_SPAWN

    sim.current = createPlayerSimState(spawn)
    inputBuffer.current.length = 0
    localTick.current = 0
    lastReconciledServerTick.current = 0
    matchTime.current = 0
    accumulator.current = 0

    const body = bodyRef.current
    if (body) {
      body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
    }
    playerHandle.pos.set(spawn[0], spawn[1], spawn[2])
    playerHandle.vel.set(0, 0, 0)
    playerHandle.grounded = false
    Input.requestLock()
  }, [phase])

  // Expose camera recoil kick to weapon system via window event
  useEffect(() => {
    const onKick = (e: Event) => {
      const detail = (e as CustomEvent).detail as { pitch: number; yaw: number; punch?: number }
      recoilPitch.current += detail.pitch
      recoilYaw.current += detail.yaw
      const p = detail.punch ?? 0
      if (p > 0) {
        recoilPunchVel.current.x += (Math.random() - 0.5) * p * 8
        recoilPunchVel.current.y += p * 6
        recoilPunchVel.current.z += p * 24
      }
      lastRecoilAt.current = performance.now() / 1000
    }
    window.addEventListener('gz:recoil', onKick)
    return () => window.removeEventListener('gz:recoil', onKick)
  }, [])

  useFrame((_, dtRaw) => {
    if (phase !== 'playing' && phase !== 'mpPlaying') return
    const body = bodyRef.current
    if (!body) return

    const dt = Math.min(dtRaw, 1 / 30) // clamp to avoid tunnelling on tab refocus

    const collider = body.collider(0)
    const simCtx = {
      rapier,
      world,
      // RapierRigidBody (from @react-three/rapier) is API-compatible with
      // RAPIER.RigidBody — cast keeps the shared signature tight.
      body: body as any,
      collider: collider as any,
      controller,
      matchTime: matchTime.current,
    }

    // ===== Pending teleport (server respawn etc.) — apply BEFORE any
    // reconciliation / sim so the rest of the frame sees the new pos.
    // The next snapshot will arrive with the same pos (server respawned
    // the player before its tick's snapshot broadcast), so reconciliation
    // will land on the same value — no race.
    if (playerHandle.pendingTeleport) {
      const [tx, ty, tz] = playerHandle.pendingTeleport
      playerHandle.pendingTeleport = null
      sim.current = createPlayerSimState([tx, ty, tz])
      inputBuffer.current.length = 0
      // Hard cut — no smooth-correction across a teleport.
      renderError.current.set(0, 0, 0)
      body.setTranslation({ x: tx, y: ty, z: tz }, true)
    }

    // ===== RECONCILIATION (MP only) =====
    // Done at the START of the frame so any drift from prediction is
    // corrected before this frame's input is built/applied.
    if (phase === 'mpPlaying') {
      const snap = useNetStore.getState().mySnap
      if (snap && snap.tick > lastReconciledServerTick.current) {
        lastReconciledServerTick.current = snap.tick

        // Drop buffered inputs the server already consumed.
        while (
          inputBuffer.current.length > 0 &&
          inputBuffer.current[0].tick <= snap.ackedTick
        ) {
          inputBuffer.current.shift()
        }

        // Replay-from-server to get the predicted position AT NOW given
        // the server's authoritative state at `ackedTick`. Compare with
        // the client's current prediction; if drift is below threshold,
        // accept the client (no visual disturbance). If above, slide the
        // visual smoothly from the old (predicted) position to the new
        // (corrected) position via renderError.
        const prevPosX = sim.current.pos[0]
        const prevPosY = sim.current.pos[1]
        const prevPosZ = sim.current.pos[2]

        sim.current.pos[0] = snap.pos[0]
        sim.current.pos[1] = snap.pos[1]
        sim.current.pos[2] = snap.pos[2]
        sim.current.vel[0] = snap.vel[0]
        sim.current.vel[1] = snap.vel[1]
        sim.current.vel[2] = snap.vel[2]
        // grounded / sliding / timers aren't sent on the wire — re-derive
        // them by replay. The first replay tick will fix `grounded`.

        // Replay every input the server hasn't acked yet.
        for (const cmd of inputBuffer.current) {
          stepPlayer(sim.current, cmd, simCtx, SIM_DT)
        }

        // Drift = how far the new (post-replay) position is from where
        // the client just thought it was. Under threshold → snap-back
        // to the client's prediction (no reconcile visible at all);
        // over → fold the diff into renderError so the camera slides
        // smoothly toward truth over the next ~150ms instead of
        // teleporting.
        const dx = prevPosX - sim.current.pos[0]
        const dy = prevPosY - sim.current.pos[1]
        const dz = prevPosZ - sim.current.pos[2]
        const driftSq = dx * dx + dy * dy + dz * dz
        const SKIP_THRESHOLD_SQ = 0.05 * 0.05 // 5 cm
        if (driftSq < SKIP_THRESHOLD_SQ) {
          // Client was right; ignore the server correction entirely.
          sim.current.pos[0] = prevPosX
          sim.current.pos[1] = prevPosY
          sim.current.pos[2] = prevPosZ
          body.setTranslation(
            { x: prevPosX, y: prevPosY, z: prevPosZ },
            true,
          )
        } else {
          // Above threshold but cap so a huge desync (lag spike, packet
          // loss) doesn't manifest as a slow drift over many seconds —
          // hard-snap visuals if the error is enormous.
          const HARD_SNAP_DIST = 2.0 // meters
          if (driftSq > HARD_SNAP_DIST * HARD_SNAP_DIST) {
            renderError.current.set(0, 0, 0)
          } else {
            // Smooth: keep the visual where it was, sim moved to truth.
            renderError.current.x += dx
            renderError.current.y += dy
            renderError.current.z += dz
          }
        }
      }
    }

    // Exponential decay of the visual error toward zero. Framerate-
    // independent: half-life ≈ 100ms (τ ≈ 144ms).
    {
      const decay = Math.exp(-dt / 0.144)
      renderError.current.multiplyScalar(decay)
      // Snap to exact zero once the residual is sub-millimeter to keep
      // floating-point noise out of downstream comparisons.
      if (renderError.current.lengthSq() < 1e-8) {
        renderError.current.set(0, 0, 0)
      }
    }

    // ===== LOOK (consumed once per render frame, used as absolute) =====
    const { yaw, pitch } = Input.consumeLook()

    // ===== FIXED-STEP SIM =====
    accumulator.current += dt
    let ticksThisFrame = 0
    // Cap at 5 sim ticks per render frame so a slow render frame doesn't
    // spiral into 100-tick catch-up.
    while (accumulator.current >= SIM_DT && ticksThisFrame < 5) {
      accumulator.current -= SIM_DT
      matchTime.current += SIM_DT
      simCtx.matchTime = matchTime.current
      localTick.current++
      ticksThisFrame++

      // Edge-triggered inputs at sim tick rate. consumeEdges clears them.
      const { jump, crouch } = Input.consumeEdges()

      const cmd: PlayerInputCmd = {
        tick: localTick.current,
        yaw,
        pitch,
        forward: Input.state.forward,
        strafe: Input.state.strafe,
        sprintHeld: Input.state.sprintHeld,
        crouchHeld: Input.state.crouchHeld,
        jumpEdge: jump,
        crouchEdge: crouch,
      }

      if (phase === 'mpPlaying') {
        NetClient.sendInput(cmd)
        inputBuffer.current.push(cmd)
        // Cap buffer at ~2s of inputs. Older than ackedTick gets shifted
        // off via reconciliation; this is just belt-and-braces.
        if (inputBuffer.current.length > 60) inputBuffer.current.shift()
      }

      const events = stepPlayer(sim.current, cmd, simCtx, SIM_DT)
      if (events.jumped) AudioBus.playJump()
      if (events.landed) AudioBus.playFootstep(0.5)
      if (events.slideStarted) AudioBus.playSlide()
    }

    // Drop accumulator excess if we hit the tick cap to avoid permanent
    // lag (player would otherwise feel "behind" on heavy frames).
    if (ticksThisFrame >= 5 && accumulator.current > SIM_DT) {
      accumulator.current = 0
    }

    // ===== Mirror sim state to playerHandle =====
    // playerHandle.pos is the *visual* position — sim.pos + renderError —
    // so camera and weapon hitscan origin slide smoothly when a
    // reconciliation correction is decaying. Physics-truth (the rapier
    // body + sim.pos itself) is unaffected.
    playerHandle.pos.set(
      sim.current.pos[0] + renderError.current.x,
      sim.current.pos[1] + renderError.current.y,
      sim.current.pos[2] + renderError.current.z,
    )
    playerHandle.vel.set(sim.current.vel[0], sim.current.vel[1], sim.current.vel[2])
    playerHandle.grounded = sim.current.grounded
    playerHandle.yaw = sim.current.yaw
    playerHandle.pitch = sim.current.pitch
    playerHandle.lookDeltaYaw = yaw - prevYaw.current
    playerHandle.lookDeltaPitch = pitch - prevPitch.current
    prevYaw.current = yaw
    prevPitch.current = pitch

    // ===== Footsteps (render-frame, based on horizontal velocity) =====
    if (sim.current.grounded && !sim.current.sliding) {
      const horizSpeed = Math.hypot(sim.current.vel[0], sim.current.vel[2])
      const sprinting = Input.state.sprintHeld && Input.state.forward > 0
      stepPhase.current += horizSpeed * dt
      const stepDist = sprinting ? 2.2 : 2.8
      if (stepPhase.current > stepDist) {
        stepPhase.current = 0
        AudioBus.playFootstep(sprinting ? 0.65 : 0.4)
      }
    } else {
      stepPhase.current = 0
    }

    // ===== Fall-out failsafe (SP only; MP uses server-side death) =====
    if (phase === 'playing' && sim.current.pos[1] < -30) killPlayer()

    // ===== Camera =====
    const horizSpeed = Math.hypot(sim.current.vel[0], sim.current.vel[2])
    const sprinting = Input.state.sprintHeld && Input.state.forward > 0
    const crouching = Input.state.crouchHeld && !sim.current.sliding
    const moving = Input.state.forward !== 0 || Input.state.strafe !== 0
    updateCamera(dt, horizSpeed, moving, sprinting, crouching)
  })

  function updateCamera(
    dt: number,
    horizSpeed: number,
    moving: boolean,
    sprinting: boolean,
    crouching: boolean,
  ) {
    const targetEye =
      crouching || sim.current.sliding ? PLAYER.CROUCH_EYE_HEIGHT : PLAYER.EYE_HEIGHT
    eyeHeight.current += (targetEye - eyeHeight.current) * Math.min(1, dt * 12)

    // FOV — ADS takes priority and uses a faster lerp.
    const aiming = Input.state.aimHeld
    const speedRatio = Math.min(1, horizSpeed / PLAYER.SPRINT_SPEED)
    const wantFov = aiming
      ? CAMERA.FOV_ADS
      : sprinting || sim.current.sliding
        ? CAMERA.FOV_SPRINT + (sim.current.sliding ? 4 : 0)
        : CAMERA.FOV_BASE + speedRatio * 4
    const fovLerp = aiming ? CAMERA.FOV_ADS_LERP : CAMERA.FOV_LERP
    fovTarget.current += (wantFov - fovTarget.current) * Math.min(1, dt * fovLerp)
    if ('fov' in camera) {
      ;(camera as any).fov = fovTarget.current
      ;(camera as any).updateProjectionMatrix?.()
    }

    // Head bob
    if (sim.current.grounded && moving && !sim.current.sliding) {
      bobTime.current += dt * CAMERA.BOB_FREQUENCY * (horizSpeed / PLAYER.WALK_SPEED)
    } else {
      bobTime.current += dt * 0.5
    }
    const bobAmpY = sprinting ? CAMERA.BOB_AMPLITUDE * 1.4 : CAMERA.BOB_AMPLITUDE
    const bobY =
      Math.sin(bobTime.current * 2) *
      bobAmpY *
      (moving && sim.current.grounded ? 1 : 0.1)
    const bobX =
      Math.cos(bobTime.current) *
      bobAmpY *
      0.6 *
      (moving && sim.current.grounded ? 1 : 0.05)
    cameraBob.current.set(bobX, bobY, 0)

    // Strafe-roll tilt
    const strafeAmount = Input.state.strafe
    const tiltTarget = -strafeAmount * CAMERA.TILT_AMOUNT
    cameraTilt.current +=
      (tiltTarget - cameraTilt.current) * Math.min(1, dt * CAMERA.TILT_LERP)

    // Sway based on look delta
    const swayRateX = playerHandle.lookDeltaYaw / Math.max(dt, 1e-4)
    const swayRateY = playerHandle.lookDeltaPitch / Math.max(dt, 1e-4)
    cameraSway.current.x +=
      (swayRateX * CAMERA.SWAY_AMOUNT - cameraSway.current.x) *
      Math.min(1, dt * CAMERA.SWAY_LERP)
    cameraSway.current.y +=
      (swayRateY * CAMERA.SWAY_AMOUNT - cameraSway.current.y) *
      Math.min(1, dt * CAMERA.SWAY_LERP)

    // Recoil decay — only recover after RECOIL_RECOVERY_DELAY since last shot.
    const timeSinceShot = performance.now() / 1000 - lastRecoilAt.current
    if (timeSinceShot > WEAPON.RECOIL_RECOVERY_DELAY) {
      recoilPitch.current +=
        (0 - recoilPitch.current) * Math.min(1, dt * CAMERA.RECOIL_RECOVERY)
      recoilYaw.current +=
        (0 - recoilYaw.current) * Math.min(1, dt * CAMERA.RECOIL_RECOVERY)
    }

    // Camera position punch — spring-damper integration.
    const k = WEAPON.VIEWMODEL_SPRING_K
    const c = WEAPON.VIEWMODEL_SPRING_DAMP
    recoilPunchVel.current.x +=
      (-k * recoilPunch.current.x - c * recoilPunchVel.current.x) * dt
    recoilPunchVel.current.y +=
      (-k * recoilPunch.current.y - c * recoilPunchVel.current.y) * dt
    recoilPunchVel.current.z +=
      (-k * recoilPunch.current.z - c * recoilPunchVel.current.z) * dt
    recoilPunch.current.addScaledVector(recoilPunchVel.current, dt)
    if (
      recoilPunch.current.lengthSq() < 1e-8 &&
      recoilPunchVel.current.lengthSq() < 1e-6
    ) {
      recoilPunch.current.set(0, 0, 0)
      recoilPunchVel.current.set(0, 0, 0)
    }

    // Compose camera transform
    const pos = playerHandle.pos
    camera.position.set(
      pos.x + cameraBob.current.x,
      pos.y - PLAYER.HEIGHT * 0.5 + eyeHeight.current + cameraBob.current.y,
      pos.z,
    )
    const lookEuler = new Euler(
      playerHandle.pitch + recoilPitch.current + cameraSway.current.y * 0.4,
      playerHandle.yaw + recoilYaw.current + cameraSway.current.x * 0.4,
      cameraTilt.current,
      'YXZ',
    )
    camera.quaternion.setFromEuler(lookEuler)

    if (recoilPunch.current.lengthSq() > 1e-8) {
      const worldPunch = recoilPunch.current.clone().applyQuaternion(camera.quaternion)
      camera.position.add(worldPunch)
    }
  }

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={[0, 2.5, 0]}
      enabledRotations={[false, false, false]}
      ccd
      collisionGroups={
        (COLLISION.GROUP_PLAYER << 16) |
        (COLLISION.GROUP_WORLD | COLLISION.GROUP_BOT)
      }
    >
      <CapsuleCollider args={[PLAYER.HEIGHT * 0.5 - PLAYER.RADIUS, PLAYER.RADIUS]} />
    </RigidBody>
  )
}
