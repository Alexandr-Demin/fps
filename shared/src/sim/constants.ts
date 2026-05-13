// Player physics constants — single source of truth for client AND server
// simulation. Don't import these from src/core/constants.ts on the server
// (that file pulls in three / browser deps); import from here on both sides.
// The client's PLAYER table re-exports from here for backwards-compat with
// non-movement code (HP, eye height, etc).

export const PLAYER_PHYS = {
  // Body dimensions
  HEIGHT: 1.8,
  RADIUS: 0.35,

  // Gravity / jump
  GRAVITY: 28,
  JUMP_VELOCITY: 8.4,

  // Ground movement
  WALK_SPEED: 6.0,
  SPRINT_SPEED: 9.6,
  CROUCH_SPEED: 3.0,
  GROUND_ACCEL: 90,
  GROUND_FRICTION: 8.5,

  // Air movement
  AIR_ACCEL: 100,
  AIR_MAX_WISH_SPEED: 0.9,
  AIR_CONTROL: 1.0,

  // Slide (CoD-style)
  SLIDE_INITIAL_BOOST: 5.5,
  SLIDE_FRICTION_START: 0.6,
  SLIDE_FRICTION_END: 4.5,
  SLIDE_MIN_SPEED: 4.5,
  SLIDE_END_SPEED: 3.0,
  SLIDE_MAX_DURATION: 1.0,
  SLIDE_COOLDOWN: 0.45,
  SLIDE_STEER_RATE: 1.7,

  // Bunny hop window
  BHOP_WINDOW: 0.06,

  // Coyote time after walking off a ledge
  COYOTE_TIME: 0.12,

  // Ground-ray length below body center
  GROUND_RAY: 0.18,

  // Death plane
  FALL_OUT_Y: -30,
} as const

// Character-controller config — kept here so client and server build the
// controller with identical autostep/snap parameters. Reconciliation only
// works if both sides agree on collision response.
export const CHAR_CONTROLLER = {
  OFFSET: 0.02,
  AUTOSTEP_MAX_HEIGHT: 0.4,
  AUTOSTEP_MIN_WIDTH: 0.15,
  AUTOSTEP_INCLUDE_DYNAMIC: true,
  SNAP_TO_GROUND_DIST: 0.35,
  MAX_SLOPE_CLIMB_DEG: 50,
  MIN_SLOPE_SLIDE_DEG: 35,
} as const

// Fixed-timestep tick for both prediction and server simulation. 30 Hz
// is the sustainable rate for the Node + Rapier WASM combo on a typical
// Windows server (tested upper-bound ≈ 38 Hz with overhead). Bumping
// this requires the server actually delivering that rate — if real
// tick rate falls below SIM_TICK_HZ, the server's sim advances slower
// than real time and predictions on the client drift continuously,
// which smooth reconciliation cannot save.
//
// Visual smoothness on the local player is recovered via render-time
// blending of the residual reconciliation error (see PlayerController's
// `renderError`); raw 30Hz step is acceptable for friends-only tier.
//
// All accel / friction constants are dt-scaled, so the number can be
// tuned later without re-tuning feel.
export const SIM_TICK_HZ = 30
export const SIM_DT = 1 / SIM_TICK_HZ
