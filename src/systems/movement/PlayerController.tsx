import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Euler, Quaternion, Vector3 } from 'three'
import { PLAYER, CAMERA, COLLISION, WEAPON } from '../../core/constants'
import { Input } from '../input/input'
import { useGameStore } from '../../state/gameStore'
import {
  airAccelerate,
  applyFriction,
  clampHorizontal,
  groundAccelerate,
} from './movement'
import { AudioBus } from '../audio/AudioSystem'
import { filterByKind } from '../../core/mapTypes'

const FALLBACK_SPAWN: [number, number, number] = [0, 2.5, 0]

const UP = new Vector3(0, 1, 0)

interface PlayerHandle {
  pos: Vector3
  vel: Vector3
  grounded: boolean
  yaw: number
  pitch: number
  lookDeltaYaw: number
  lookDeltaPitch: number
  body: RapierRigidBody | null
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
}

export function PlayerController() {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const { world, rapier } = useRapier()
  const { camera } = useThree()

  // Movement state
  const velocity = useRef(new Vector3())
  const grounded = useRef(false)
  const groundedTimer = useRef(0)
  const coyoteTimer = useRef(0)
  const sliding = useRef(false)
  const slideTimer = useRef(0)
  const slideCooldown = useRef(0)
  const eyeHeight = useRef(PLAYER.EYE_HEIGHT)
  const lastJumpAt = useRef(-1)
  const lastLandAt = useRef(-1)
  const stepPhase = useRef(0)
  const fovTarget = useRef(CAMERA.FOV_BASE)
  const bobTime = useRef(0)
  const cameraTilt = useRef(0)
  const cameraBob = useRef(new Vector3())
  const cameraSway = useRef(new Vector3())
  const recoilPitch = useRef(0)
  const recoilYaw = useRef(0)
  const recoilPunch = useRef(new Vector3())     // camera position punch (decays)
  const recoilPunchVel = useRef(new Vector3())  // spring velocity for punch
  const lastRecoilAt = useRef(-1)               // for recovery delay
  const prevYaw = useRef(0)
  const prevPitch = useRef(0)
  const frameCounter = useRef(0)

  const phase = useGameStore((s) => s.phase)
  const killPlayer = useGameStore((s) => s.killPlayer)

  // Build the Rapier character controller imperatively
  const controller = useMemo(() => {
    const c = world.createCharacterController(0.02)
    c.enableAutostep(0.4, 0.15, true)
    c.enableSnapToGround(0.35)
    c.setSlideEnabled(true)
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    c.setMinSlopeSlideAngle((35 * Math.PI) / 180)
    c.setApplyImpulsesToDynamicBodies(false)
    c.setUp({ x: 0, y: 1, z: 0 })
    return c
  }, [world])

  useEffect(() => {
    return () => {
      try {
        world.removeCharacterController(controller)
      } catch {}
    }
  }, [world, controller])

  // Expose rigid body to other systems (hitscan filter, etc.)
  useEffect(() => {
    playerHandle.body = bodyRef.current
    return () => {
      playerHandle.body = null
    }
  }, [])

  // Spawn / respawn handling
  useEffect(() => {
    if (phase === 'playing' || phase === 'mpPlaying') {
      const map = useGameStore.getState().currentMap
      const spawns = filterByKind(map.entities, 'playerSpawn')
      const spawn: [number, number, number] =
        spawns.length > 0
          ? spawns[Math.floor(Math.random() * spawns.length)].pos
          : FALLBACK_SPAWN
      const body = bodyRef.current
      if (body) {
        body.setNextKinematicTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] })
        body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
      }
      velocity.current.set(0, 0, 0)
      playerHandle.pos.set(spawn[0], spawn[1], spawn[2])
      playerHandle.vel.set(0, 0, 0)
      grounded.current = false
      sliding.current = false
      slideCooldown.current = 0
      Input.requestLock()
    }
  }, [phase])

  // Expose camera recoil kick to weapon system via window event
  useEffect(() => {
    const onKick = (e: Event) => {
      const detail = (e as CustomEvent).detail as { pitch: number; yaw: number; punch?: number }
      recoilPitch.current += detail.pitch
      recoilYaw.current += detail.yaw
      // Spring impulse — pushes camera back along view direction + slight up.
      // Direction here is camera-local; we apply in camera space later.
      const p = detail.punch ?? 0
      if (p > 0) {
        recoilPunchVel.current.x += (Math.random() - 0.5) * p * 8
        recoilPunchVel.current.y += p * 6
        recoilPunchVel.current.z += p * 24  // backward push (into camera Z+)
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

    // ===== LOOK =====
    const { yaw, pitch } = Input.consumeLook()
    playerHandle.lookDeltaYaw = yaw - prevYaw.current
    playerHandle.lookDeltaPitch = pitch - prevPitch.current
    prevYaw.current = yaw
    prevPitch.current = pitch
    playerHandle.yaw = yaw
    playerHandle.pitch = pitch

    // forward/right vectors on horizontal plane
    const sinY = Math.sin(yaw)
    const cosY = Math.cos(yaw)
    const forward = new Vector3(-sinY, 0, -cosY)
    const right = new Vector3(cosY, 0, -sinY)

    // ===== INPUT → WISH =====
    const wishDir = new Vector3()
    wishDir.addScaledVector(forward, Input.state.forward)
    wishDir.addScaledVector(right, Input.state.strafe)
    const wishHasInput = wishDir.lengthSq() > 0.001
    if (wishHasInput) wishDir.normalize()

    const sprinting = Input.state.sprintHeld && Input.state.forward > 0 && !sliding.current
    const crouching = Input.state.crouchHeld && !sliding.current
    const wishSpeed = crouching
      ? PLAYER.CROUCH_SPEED
      : sprinting
        ? PLAYER.SPRINT_SPEED
        : PLAYER.WALK_SPEED

    // ===== GROUND CHECK =====
    // Cast a vertical ray from the body center down past the foot, excluding
    // the player's own rigid body so we don't self-hit.
    const t = body.translation()
    const origin = new Vector3(t.x, t.y, t.z)
    const groundRay = new rapier.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: -1, z: 0 }
    )
    const hit = world.castRay(
      groundRay,
      PLAYER.HEIGHT * 0.5 + 0.18,
      true,
      undefined,
      undefined,
      undefined,
      body
    )
    const wasGrounded = grounded.current
    grounded.current = !!hit
    if (grounded.current) {
      groundedTimer.current += dt
      coyoteTimer.current = 0.12
      if (!wasGrounded) {
        // Landed
        lastLandAt.current = performance.now() / 1000
        AudioBus.playFootstep(0.5)
      }
    } else {
      groundedTimer.current = 0
      coyoteTimer.current = Math.max(0, coyoteTimer.current - dt)
    }

    // ===== EDGES =====
    const { jump, crouch: crouchPressed, fire: _fire } = Input.consumeEdges()

    // ===== SLIDE LOGIC =====
    // CoD-style: requires sprint-equivalent speed, can't be spammed (cooldown
    // after end), boost is in camera-forward direction so the slide always
    // launches where the player is looking — not where momentum happens to be.
    const horizSpeed = Math.hypot(velocity.current.x, velocity.current.z)
    if (slideCooldown.current > 0) slideCooldown.current -= dt
    if (
      !sliding.current &&
      grounded.current &&
      crouchPressed &&
      horizSpeed > PLAYER.SLIDE_MIN_SPEED &&
      slideCooldown.current <= 0
    ) {
      sliding.current = true
      slideTimer.current = 0
      // Launch along camera-forward (predictable feel, like CoD).
      velocity.current.addScaledVector(forward, PLAYER.SLIDE_INITIAL_BOOST)
      AudioBus.playSlide()
    }
    if (sliding.current) {
      slideTimer.current += dt
      const slideTooSlow = horizSpeed < PLAYER.SLIDE_END_SPEED
      if (
        !Input.state.crouchHeld ||
        !grounded.current ||
        slideTimer.current > PLAYER.SLIDE_MAX_DURATION ||
        slideTooSlow
      ) {
        sliding.current = false
        slideCooldown.current = PLAYER.SLIDE_COOLDOWN
      }
    }

    // ===== HORIZONTAL VELOCITY =====
    const horiz = new Vector3(velocity.current.x, 0, velocity.current.z)
    if (grounded.current) {
      // CS-style bhop: only an edge-triggered jump within BHOP_WINDOW after
      // landing skips friction (and also skips ground accel that frame, so
      // momentum carries through exactly). Holding space does NOT auto-hop —
      // the player must tap rhythmically. Miss the window → instant friction.
      const timeSinceLand = performance.now() / 1000 - lastLandAt.current
      const bhopThisFrame = jump && timeSinceLand < PLAYER.BHOP_WINDOW
      if (sliding.current) {
        // Friction ramps from low (preserves momentum at slide start) to
        // higher near the end — gives the CoD "you slide far then taper"
        // shape instead of a constant decay.
        const tNorm = Math.min(1, slideTimer.current / PLAYER.SLIDE_MAX_DURATION)
        const slideFrictionNow =
          PLAYER.SLIDE_FRICTION_START +
          (PLAYER.SLIDE_FRICTION_END - PLAYER.SLIDE_FRICTION_START) * tNorm
        applyFriction(horiz, slideFrictionNow, 1, dt)

        // Small steering: rotate the horizontal velocity toward where the
        // camera is looking, capped by SLIDE_STEER_RATE. Lets the player
        // curve the slide slightly without breaking the launch direction.
        const speed = Math.hypot(horiz.x, horiz.z)
        if (speed > 0.5) {
          const dirX = horiz.x / speed
          const dirZ = horiz.z / speed
          const cosT = dirX * forward.x + dirZ * forward.z
          const sinT = forward.x * dirZ - forward.z * dirX
          let angle = Math.atan2(sinT, cosT)
          const maxRot = PLAYER.SLIDE_STEER_RATE * dt
          if (Math.abs(angle) > maxRot) angle = Math.sign(angle) * maxRot
          const cosA = Math.cos(angle)
          const sinA = Math.sin(angle)
          const nx = horiz.x * cosA + horiz.z * sinA
          const nz = -horiz.x * sinA + horiz.z * cosA
          horiz.x = nx
          horiz.z = nz
        }
      } else if (!bhopThisFrame) {
        applyFriction(horiz, PLAYER.GROUND_FRICTION, PLAYER.WALK_SPEED * 0.8, dt)
      }
      if (wishHasInput && !sliding.current && !bhopThisFrame) {
        groundAccelerate(horiz, wishDir, wishSpeed, PLAYER.GROUND_ACCEL, dt)
      }
    } else {
      // Air
      if (wishHasInput) {
        airAccelerate(
          horiz,
          wishDir,
          wishSpeed,
          PLAYER.AIR_MAX_WISH_SPEED,
          PLAYER.AIR_ACCEL * PLAYER.AIR_CONTROL,
          dt
        )
      }
    }

    velocity.current.x = horiz.x
    velocity.current.z = horiz.z

    // Speed cap to keep things sane (allow bhop to exceed sprint)
    clampHorizontal(velocity.current, PLAYER.SPRINT_SPEED * 2.2)

    // ===== JUMP =====
    if (jump && (grounded.current || coyoteTimer.current > 0)) {
      velocity.current.y = PLAYER.JUMP_VELOCITY
      grounded.current = false
      coyoteTimer.current = 0
      lastJumpAt.current = performance.now() / 1000
      AudioBus.playJump()
      if (sliding.current) {
        sliding.current = false
        slideCooldown.current = PLAYER.SLIDE_COOLDOWN
      }
    }

    // ===== GRAVITY =====
    if (!grounded.current) {
      velocity.current.y -= PLAYER.GRAVITY * dt
      if (velocity.current.y < -55) velocity.current.y = -55
    } else if (velocity.current.y < 0) {
      velocity.current.y = -2 // small hold-down to ensure snap-to-ground works
    }

    // ===== MOVE =====
    const desired = {
      x: velocity.current.x * dt,
      y: velocity.current.y * dt,
      z: velocity.current.z * dt,
    }
    const collider = body.collider(0)
    controller.computeColliderMovement(collider, desired)
    const movement = controller.computedMovement()

    // If we hit a wall horizontally, kill that component of velocity to avoid
    // sticky push.
    if (Math.abs(movement.x) < Math.abs(desired.x) * 0.5) velocity.current.x *= 0.0
    if (Math.abs(movement.z) < Math.abs(desired.z) * 0.5) velocity.current.z *= 0.0
    if (movement.y > desired.y + 0.001 && velocity.current.y < 0) velocity.current.y = 0
    if (movement.y < desired.y - 0.001 && velocity.current.y > 0) velocity.current.y = 0

    const nextPos = {
      x: t.x + movement.x,
      y: t.y + movement.y,
      z: t.z + movement.z,
    }
    body.setNextKinematicTranslation(nextPos)

    playerHandle.pos.set(nextPos.x, nextPos.y, nextPos.z)
    playerHandle.vel.copy(velocity.current)
    playerHandle.grounded = grounded.current

    // Fall-out-of-world failsafe
    if (nextPos.y < -30) killPlayer()

    // ===== CAMERA RIG =====
    updateCamera(dt, horizSpeed, wishHasInput, sprinting, crouching)

    // ===== FOOTSTEPS =====
    if (grounded.current && !sliding.current) {
      stepPhase.current += horizSpeed * dt
      const stepDist = sprinting ? 2.2 : 2.8
      if (stepPhase.current > stepDist) {
        stepPhase.current = 0
        AudioBus.playFootstep(sprinting ? 0.65 : 0.4)
      }
    } else {
      stepPhase.current = 0
    }
  })

  function updateCamera(
    dt: number,
    horizSpeed: number,
    moving: boolean,
    sprinting: boolean,
    crouching: boolean
  ) {
    const targetEye = crouching || sliding.current ? PLAYER.CROUCH_EYE_HEIGHT : PLAYER.EYE_HEIGHT
    eyeHeight.current += (targetEye - eyeHeight.current) * Math.min(1, dt * 12)

    // FOV — ADS takes priority and uses a faster lerp for snappy zoom in/out
    const aiming = Input.state.aimHeld
    const speedRatio = Math.min(1, horizSpeed / PLAYER.SPRINT_SPEED)
    const wantFov = aiming
      ? CAMERA.FOV_ADS
      : sprinting || sliding.current
        ? CAMERA.FOV_SPRINT + (sliding.current ? 4 : 0)
        : CAMERA.FOV_BASE + speedRatio * 4
    const fovLerp = aiming ? CAMERA.FOV_ADS_LERP : CAMERA.FOV_LERP
    fovTarget.current += (wantFov - fovTarget.current) * Math.min(1, dt * fovLerp)
    if ('fov' in camera) {
      ;(camera as any).fov = fovTarget.current
      ;(camera as any).updateProjectionMatrix?.()
    }

    // Head bob
    if (grounded.current && moving && !sliding.current) {
      bobTime.current += dt * CAMERA.BOB_FREQUENCY * (horizSpeed / PLAYER.WALK_SPEED)
    } else {
      bobTime.current += dt * 0.5
    }
    const bobAmpY = sprinting ? CAMERA.BOB_AMPLITUDE * 1.4 : CAMERA.BOB_AMPLITUDE
    const bobY = Math.sin(bobTime.current * 2) * bobAmpY * (moving && grounded.current ? 1 : 0.1)
    const bobX = Math.cos(bobTime.current) * bobAmpY * 0.6 * (moving && grounded.current ? 1 : 0.05)
    cameraBob.current.set(bobX, bobY, 0)

    // Strafe-roll tilt (subtle)
    const strafeAmount = Input.state.strafe
    const tiltTarget = -strafeAmount * CAMERA.TILT_AMOUNT
    cameraTilt.current += (tiltTarget - cameraTilt.current) * Math.min(1, dt * CAMERA.TILT_LERP)

    // Sway based on look delta (rate = delta/dt). Smoothed by exponential lerp.
    const swayRateX = playerHandle.lookDeltaYaw / Math.max(dt, 1e-4)
    const swayRateY = playerHandle.lookDeltaPitch / Math.max(dt, 1e-4)
    cameraSway.current.x += (swayRateX * CAMERA.SWAY_AMOUNT - cameraSway.current.x) * Math.min(1, dt * CAMERA.SWAY_LERP)
    cameraSway.current.y += (swayRateY * CAMERA.SWAY_AMOUNT - cameraSway.current.y) * Math.min(1, dt * CAMERA.SWAY_LERP)

    // Recoil decay — only recover after RECOIL_RECOVERY_DELAY has elapsed
    // since last shot, so during sustained fire the aim drifts and player
    // must either stop firing or compensate manually.
    const timeSinceShot = performance.now() / 1000 - lastRecoilAt.current
    if (timeSinceShot > WEAPON.RECOIL_RECOVERY_DELAY) {
      recoilPitch.current += (0 - recoilPitch.current) * Math.min(1, dt * CAMERA.RECOIL_RECOVERY)
      recoilYaw.current += (0 - recoilYaw.current) * Math.min(1, dt * CAMERA.RECOIL_RECOVERY)
    }

    // Camera position punch — spring-damper integration.
    // dv/dt = -k * x - c * v
    const k = WEAPON.VIEWMODEL_SPRING_K
    const c = WEAPON.VIEWMODEL_SPRING_DAMP
    recoilPunchVel.current.x += (-k * recoilPunch.current.x - c * recoilPunchVel.current.x) * dt
    recoilPunchVel.current.y += (-k * recoilPunch.current.y - c * recoilPunchVel.current.y) * dt
    recoilPunchVel.current.z += (-k * recoilPunch.current.z - c * recoilPunchVel.current.z) * dt
    recoilPunch.current.addScaledVector(recoilPunchVel.current, dt)
    // Clamp tiny residuals
    if (recoilPunch.current.lengthSq() < 1e-8 && recoilPunchVel.current.lengthSq() < 1e-6) {
      recoilPunch.current.set(0, 0, 0)
      recoilPunchVel.current.set(0, 0, 0)
    }

    // Compose camera transform
    const pos = playerHandle.pos
    camera.position.set(
      pos.x + cameraBob.current.x,
      pos.y - PLAYER.HEIGHT * 0.5 + eyeHeight.current + cameraBob.current.y,
      pos.z
    )
    const lookEuler = new Euler(
      playerHandle.pitch + recoilPitch.current + cameraSway.current.y * 0.4,
      playerHandle.yaw + recoilYaw.current + cameraSway.current.x * 0.4,
      cameraTilt.current,
      'YXZ'
    )
    camera.quaternion.setFromEuler(lookEuler)

    // Apply recoil punch in camera-local space — gun "kicks" the camera back.
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
