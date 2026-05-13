// Player physics step — shared by client (prediction) and server
// (authoritative simulation). Identical code path on both sides so
// reconciliation only sees floating-point drift, not divergent behavior.

import type RAPIER from '@dimforge/rapier3d-compat'
import type { Vec3 } from '../protocol.js'
import {
  airAccelerate,
  applyFrictionXZ,
  clampHorizontal,
  groundAccelerate,
} from './helpers.js'
import { PLAYER_PHYS } from './constants.js'

/**
 * Everything that can change tick-to-tick about a player. Position lives
 * on the Rapier body; everything else is plain numbers / bools so it can
 * be (de)serialised cheaply for reconciliation snapshots.
 */
export interface PlayerSimState {
  pos: Vec3
  vel: Vec3
  yaw: number
  pitch: number
  grounded: boolean
  sliding: boolean
  slideTimer: number
  slideCooldown: number
  coyoteTimer: number
  // Match-relative seconds when the player last touched ground. Used by
  // the bhop window check.
  lastLandAt: number
}

/**
 * Per-tick command from a player. The client sends one of these per fixed
 * SIM_DT slice; the server applies the latest received command for each
 * player on every server tick.
 */
export interface PlayerInputCmd {
  tick: number
  // Absolute look angles in radians (yaw/pitch). Sending absolute rather
  // than delta keeps the server's player.yaw/pitch in sync even if a
  // command is dropped.
  yaw: number
  pitch: number
  forward: number      // -1, 0, 1
  strafe: number       // -1, 0, 1
  sprintHeld: boolean
  crouchHeld: boolean
  // Edge-triggered: true on the single tick the player started pressing
  // the key. Used for jump impulse and slide entry.
  jumpEdge: boolean
  crouchEdge: boolean
}

/**
 * Side effects the step produced. Client uses these to drive audio +
 * camera FX. Server ignores them.
 */
export interface PlayerSimEvents {
  jumped: boolean
  landed: boolean
  slideStarted: boolean
}

/**
 * Rapier context for one player. Owned by whoever holds the player —
 * the client's PlayerController has one for the local player, the
 * server's Lobby has one per player in each room.
 */
export interface PlayerSimCtx {
  rapier: typeof RAPIER
  world: RAPIER.World
  body: RAPIER.RigidBody          // kinematicPositionBased capsule
  collider: RAPIER.Collider
  controller: RAPIER.KinematicCharacterController
  // Monotonic match-time in seconds. Used together with state.lastLandAt
  // for the bhop window check.
  matchTime: number
}

export function createPlayerSimState(spawn: Vec3): PlayerSimState {
  return {
    pos: [spawn[0], spawn[1], spawn[2]],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    grounded: false,
    sliding: false,
    slideTimer: 0,
    slideCooldown: 0,
    coyoteTimer: 0,
    lastLandAt: -999,
  }
}

const NO_EVENTS: PlayerSimEvents = Object.freeze({
  jumped: false,
  landed: false,
  slideStarted: false,
}) as PlayerSimEvents

/**
 * Run one fixed-step simulation tick for `state`, applying `input` against
 * the Rapier world via `ctx.controller`. Mutates `state` and the Rapier
 * body's translation; returns the events that happened on this tick so
 * the caller can fire audio / FX as appropriate.
 */
export function stepPlayer(
  state: PlayerSimState,
  input: PlayerInputCmd,
  ctx: PlayerSimCtx,
  dt: number,
): PlayerSimEvents {
  const { world, body, collider, controller, rapier, matchTime } = ctx

  // Sync the rapier body to our canonical `state.pos` before any spatial
  // queries. The state is the source of truth (client uses it during
  // reconciliation replay where world.step() doesn't run between ticks);
  // the body is a collision-query handle that we keep in lockstep.
  body.setTranslation({ x: state.pos[0], y: state.pos[1], z: state.pos[2] }, true)

  // ===== LOOK (absolute) =====
  state.yaw = input.yaw
  state.pitch = input.pitch

  // forward/right vectors on horizontal plane (same convention as the
  // client camera — three.js -Z is forward, +X is right, yaw rotates
  // around +Y, positive yaw turns left).
  const sinY = Math.sin(input.yaw)
  const cosY = Math.cos(input.yaw)
  const fX = -sinY, fZ = -cosY
  const rX =  cosY, rZ = -sinY

  // ===== WISH DIR =====
  let wishX = fX * input.forward + rX * input.strafe
  let wishZ = fZ * input.forward + rZ * input.strafe
  const wishLen = Math.hypot(wishX, wishZ)
  const wishHasInput = wishLen > 0.001
  if (wishHasInput) {
    wishX /= wishLen
    wishZ /= wishLen
  }

  const sprinting = input.sprintHeld && input.forward > 0 && !state.sliding
  const crouching = input.crouchHeld && !state.sliding
  const wishSpeed = crouching
    ? PLAYER_PHYS.CROUCH_SPEED
    : sprinting
      ? PLAYER_PHYS.SPRINT_SPEED
      : PLAYER_PHYS.WALK_SPEED

  // ===== GROUND CHECK =====
  const groundRay = new rapier.Ray(
    { x: state.pos[0], y: state.pos[1], z: state.pos[2] },
    { x: 0, y: -1, z: 0 },
  )
  const hit = world.castRay(
    groundRay,
    PLAYER_PHYS.HEIGHT * 0.5 + PLAYER_PHYS.GROUND_RAY,
    true,
    undefined,
    undefined,
    undefined,
    body,
  )
  const wasGrounded = state.grounded
  state.grounded = !!hit

  const events = { jumped: false, landed: false, slideStarted: false }

  if (state.grounded) {
    state.coyoteTimer = PLAYER_PHYS.COYOTE_TIME
    if (!wasGrounded) {
      state.lastLandAt = matchTime
      events.landed = true
    }
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt)
  }

  // ===== SLIDE LOGIC =====
  const horizSpeed = Math.hypot(state.vel[0], state.vel[2])
  if (state.slideCooldown > 0) state.slideCooldown -= dt

  if (
    !state.sliding &&
    state.grounded &&
    input.crouchEdge &&
    horizSpeed > PLAYER_PHYS.SLIDE_MIN_SPEED &&
    state.slideCooldown <= 0
  ) {
    state.sliding = true
    state.slideTimer = 0
    // Launch along camera-forward (predictable feel — see PlayerController).
    state.vel[0] += fX * PLAYER_PHYS.SLIDE_INITIAL_BOOST
    state.vel[2] += fZ * PLAYER_PHYS.SLIDE_INITIAL_BOOST
    events.slideStarted = true
  }

  if (state.sliding) {
    state.slideTimer += dt
    const slideTooSlow = horizSpeed < PLAYER_PHYS.SLIDE_END_SPEED
    if (
      !input.crouchHeld ||
      !state.grounded ||
      state.slideTimer > PLAYER_PHYS.SLIDE_MAX_DURATION ||
      slideTooSlow
    ) {
      state.sliding = false
      state.slideCooldown = PLAYER_PHYS.SLIDE_COOLDOWN
    }
  }

  // ===== HORIZONTAL VELOCITY =====
  if (state.grounded) {
    const timeSinceLand = matchTime - state.lastLandAt
    const bhopThisFrame = input.jumpEdge && timeSinceLand < PLAYER_PHYS.BHOP_WINDOW

    if (state.sliding) {
      // Friction ramps from low to high over the slide's duration.
      const tNorm = Math.min(1, state.slideTimer / PLAYER_PHYS.SLIDE_MAX_DURATION)
      const slideFrictionNow =
        PLAYER_PHYS.SLIDE_FRICTION_START +
        (PLAYER_PHYS.SLIDE_FRICTION_END - PLAYER_PHYS.SLIDE_FRICTION_START) * tNorm
      applyFrictionXZ(state.vel, slideFrictionNow, 1, dt)

      // Small steering toward camera-forward, capped per tick.
      const speed = Math.hypot(state.vel[0], state.vel[2])
      if (speed > 0.5) {
        const dirX = state.vel[0] / speed
        const dirZ = state.vel[2] / speed
        const cosT = dirX * fX + dirZ * fZ
        const sinT = fX * dirZ - fZ * dirX
        let angle = Math.atan2(sinT, cosT)
        const maxRot = PLAYER_PHYS.SLIDE_STEER_RATE * dt
        if (Math.abs(angle) > maxRot) angle = Math.sign(angle) * maxRot
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const nx = state.vel[0] * cosA + state.vel[2] * sinA
        const nz = -state.vel[0] * sinA + state.vel[2] * cosA
        state.vel[0] = nx
        state.vel[2] = nz
      }
    } else if (!bhopThisFrame) {
      applyFrictionXZ(state.vel, PLAYER_PHYS.GROUND_FRICTION, PLAYER_PHYS.WALK_SPEED * 0.8, dt)
    }

    if (wishHasInput && !state.sliding && !bhopThisFrame) {
      groundAccelerate(state.vel, wishX, wishZ, wishSpeed, PLAYER_PHYS.GROUND_ACCEL, dt)
    }
  } else {
    if (wishHasInput) {
      airAccelerate(
        state.vel,
        wishX, wishZ,
        wishSpeed,
        PLAYER_PHYS.AIR_MAX_WISH_SPEED,
        PLAYER_PHYS.AIR_ACCEL * PLAYER_PHYS.AIR_CONTROL,
        dt,
      )
    }
  }

  clampHorizontal(state.vel, PLAYER_PHYS.SPRINT_SPEED * 2.2)

  // ===== JUMP =====
  if (input.jumpEdge && (state.grounded || state.coyoteTimer > 0)) {
    state.vel[1] = PLAYER_PHYS.JUMP_VELOCITY
    state.grounded = false
    state.coyoteTimer = 0
    events.jumped = true
    if (state.sliding) {
      state.sliding = false
      state.slideCooldown = PLAYER_PHYS.SLIDE_COOLDOWN
    }
  }

  // ===== GRAVITY =====
  if (!state.grounded) {
    state.vel[1] -= PLAYER_PHYS.GRAVITY * dt
    if (state.vel[1] < -55) state.vel[1] = -55
  } else if (state.vel[1] < 0) {
    state.vel[1] = -2 // small hold-down keeps snap-to-ground working
  }

  // ===== MOVE =====
  const desired = { x: state.vel[0] * dt, y: state.vel[1] * dt, z: state.vel[2] * dt }
  controller.computeColliderMovement(collider, desired)
  const movement = controller.computedMovement()

  // Kill velocity components that were stopped by walls/floor so the
  // player doesn't keep accumulating in that direction next tick.
  if (Math.abs(movement.x) < Math.abs(desired.x) * 0.5) state.vel[0] = 0
  if (Math.abs(movement.z) < Math.abs(desired.z) * 0.5) state.vel[2] = 0
  if (movement.y > desired.y + 0.001 && state.vel[1] < 0) state.vel[1] = 0
  if (movement.y < desired.y - 0.001 && state.vel[1] > 0) state.vel[1] = 0

  const nx = state.pos[0] + movement.x
  const ny = state.pos[1] + movement.y
  const nz = state.pos[2] + movement.z
  // Immediate reposition so the next call to stepPlayer in the same JS
  // turn (e.g. client replay during reconciliation) sees the new body
  // position without a world.step() in between.
  body.setTranslation({ x: nx, y: ny, z: nz }, true)
  state.pos[0] = nx
  state.pos[1] = ny
  state.pos[2] = nz

  return events.jumped || events.landed || events.slideStarted ? events : NO_EVENTS
}

/**
 * Construct the Rapier character controller with the same parameters on
 * client and server. Pulled into shared so reconciliation drift stays
 * just floating-point noise.
 */
export function createPlayerCharacterController(
  rapier: typeof RAPIER,
  world: RAPIER.World,
) {
  const c = world.createCharacterController(0.02)
  c.enableAutostep(0.4, 0.15, true)
  c.enableSnapToGround(0.35)
  c.setSlideEnabled(true)
  c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
  c.setMinSlopeSlideAngle((35 * Math.PI) / 180)
  c.setApplyImpulsesToDynamicBodies(false)
  c.setUp({ x: 0, y: 1, z: 0 })
  return c
}
