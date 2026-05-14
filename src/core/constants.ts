// SECTOR - 17 — tunable gameplay constants. All units in meters/seconds.

export const PLAYER = {
  HEIGHT: 1.8,
  RADIUS: 0.35,
  EYE_HEIGHT: 1.6,
  CROUCH_EYE_HEIGHT: 1.05,
  MAX_HP: 100,

  GRAVITY: 28,
  JUMP_VELOCITY: 8.4,

  // Ground movement
  WALK_SPEED: 6.0,
  SPRINT_SPEED: 9.6,
  CROUCH_SPEED: 3.0,
  GROUND_ACCEL: 90,
  GROUND_FRICTION: 8.5,

  // Air movement (CS / Quake-style strafing)
  AIR_ACCEL: 100,                // higher accel compensates for tighter cap
  AIR_MAX_WISH_SPEED: 0.9,       // CS sv_maxairspeed ~30u ≈ 0.57m; we use 0.9 for browser feel
  AIR_CONTROL: 1.0,

  // Slide — Call-of-Duty-style: must be sprinting to enter, boosted launch,
  // low friction at start + ramps up toward the end (rather than constant),
  // a small steering rate so the slide can curve toward where the camera is
  // looking, and a brief cooldown after release to prevent slide spam.
  SLIDE_INITIAL_BOOST: 7.0,
  SLIDE_FRICTION_START: 0.4,
  SLIDE_FRICTION_END: 4.5,
  SLIDE_MIN_SPEED: 4.5,     // entry threshold — any forward motion qualifies; standing still does not
  SLIDE_END_SPEED: 3.0,     // bail out when slide has decayed below this
  SLIDE_MAX_DURATION: 1.4,
  SLIDE_COOLDOWN: 0.45,
  SLIDE_STEER_RATE: 1.7,    // rad/s of slide-direction turning toward camera
  // Multiplier on JUMP_VELOCITY when the player jumps mid-slide. Gives the
  // slide a satisfying launch payoff (movement-tech reward) without changing
  // the regular jump height.
  SLIDE_JUMP_MULTIPLIER: 1.35,

  // Bunny hop — CS-style: timing-strict, no auto-hop.
  // Player must press space within this window after landing to skip friction
  // and preserve momentum. Holding space does NOT autohop.
  BHOP_WINDOW: 0.06,
}

export const CAMERA = {
  FOV_BASE: 92,
  FOV_SPRINT: 102,
  FOV_ADS: 55,
  FOV_LERP: 7,
  FOV_ADS_LERP: 14,
  BOB_AMPLITUDE: 0.045,
  BOB_FREQUENCY: 9.5,
  TILT_AMOUNT: 0.025,
  TILT_LERP: 6,
  SWAY_AMOUNT: 0.018,
  SWAY_LERP: 9,
  RECOIL_RECOVERY: 9,
  ADS_SENSITIVITY_SCALE: 0.55,
}

export const WEAPON = {
  NAME: 'KZ-7 HEAVY',
  DAMAGE: 34,
  HEADSHOT_MULT: 2.0,
  RANGE: 200,
  FIRE_INTERVAL: 0.18,    // 333 RPM
  MAG_SIZE: 10,
  RESERVE: Infinity,
  RELOAD_TIME: 1.6,
  RECOIL_PITCH: 0.045,           // base per-shot pitch kick (radians)
  RECOIL_YAW: 0.018,             // base per-shot yaw kick (radians)
  RECOIL_BURST_RESET: 0.32,      // seconds of no-fire that reset spray pattern
  RECOIL_RECOVERY_DELAY: 0.18,   // seconds after last shot before camera returns
  RECOIL_PITCH_GROWTH: 0.18,     // per-shot multiplier growth
  RECOIL_PITCH_MAX: 2.6,         // hard cap on pitch growth multiplier
  RECOIL_YAW_GROWTH: 0.22,
  RECOIL_YAW_MAX: 2.2,
  RECOIL_PUNCH: 0.018,           // camera position punch amplitude (m)
  VIEWMODEL_KICK_IMPULSE: 5.5,   // view-model spring impulse per shot
  VIEWMODEL_SPRING_K: 90,        // spring stiffness
  VIEWMODEL_SPRING_DAMP: 12,     // spring damping
  SPREAD_BASE: 0.0015,
  SPREAD_MOVE: 0.012,
}

// Hitbox zones — coordinates are local to the bot's body center (rigid body
// translation). The Y boundaries are used both for visual wireframe rendering
// and for resolving hit zones from a hitscan point.
export const HITBOX = {
  HEAD: {
    center: [0, 0.7, 0] as const,
    size:   [0.50, 0.42, 0.46] as const,
    color: '#ff3030',
    multiplier: 2.0,
    yMin: 0.49,
  },
  TORSO: {
    center: [0, 0.16, 0] as const,
    size:   [0.72, 0.66, 0.52] as const,
    color: '#48c8ff',
    multiplier: 1.0,
    yMin: -0.17,
  },
  LEGS: {
    center: [0, -0.5, 0] as const,
    size:   [0.58, 0.78, 0.46] as const,
    color: '#62f59a',
    multiplier: 0.7,
    yMin: -Infinity,
  },
}

// Crouch / slide hitbox table — same multipliers and visual sizes as the
// standing table, but every Y boundary shifts down by CROUCH_VISUAL_Y_SHIFT
// to match the lower visible silhouette. Selected by Weapon.tsx when the
// target's state is 'crouching' or 'sliding', so headshots on a crouching
// opponent require aiming at where their head actually is, not where it
// would be if they were standing.
export const HITBOX_CROUCH = {
  HEAD: {
    center: [0, 0.34, 0] as const,
    size:   [0.50, 0.42, 0.46] as const,
    color: '#ff3030',
    multiplier: 2.0,
    yMin: 0.13,
  },
  TORSO: {
    center: [0, -0.20, 0] as const,
    size:   [0.72, 0.66, 0.52] as const,
    color: '#48c8ff',
    multiplier: 1.0,
    yMin: -0.53,
  },
  LEGS: {
    center: [0, -0.86, 0] as const,
    size:   [0.58, 0.78, 0.46] as const,
    color: '#62f59a',
    multiplier: 0.7,
    yMin: -Infinity,
  },
}

// Remote-model pose tweaks driven by snap.state. The visual capsule keeps
// the same world-space ground reference — we squash by CROUCH_VISUAL_SCALE
// and offset DOWN by CROUCH_VISUAL_Y_SHIFT so the feet stay put. The
// HITBOX_CROUCH yMin values mirror this offset so visual and hit zones
// agree.
export const REMOTE_POSE = {
  CROUCH_VISUAL_SCALE: 0.6,
  CROUCH_VISUAL_Y_SHIFT: -0.36,
  // Forward tilt while sliding (radians). Applied as -rotation.x on the
  // already-yaw-rotated parent, so the player tips toward where they're
  // looking — gives the slide a distinct silhouette without breaking the
  // simple capsule shape.
  SLIDE_TILT: Math.PI / 6,
  // How fast the pose lerps toward the target. Higher = snappier; at 12
  // a stand→crouch transition resolves in ~250ms which matches the local
  // PlayerController eye-height lerp closely enough.
  POSE_LERP_RATE: 12,
}

export const BOT = {
  HEIGHT: 1.8,
  RADIUS: 0.4,
  MAX_HP: 60,
  WALK_SPEED: 3.2,
  CHASE_SPEED: 4.6,
  SIGHT_RANGE: 38,
  SIGHT_FOV: Math.PI * 0.7,     // ~125°
  ATTACK_RANGE: 28,
  ATTACK_INTERVAL: 0.85,
  ATTACK_DAMAGE: 9,

  // Accuracy — modeled after CS-bot behavior: bots stand to shoot, and how
  // hard you are to hit depends on your movement, the time since the bot
  // spotted you, and sustained-fire spray growth.
  ATTACK_SPREAD_BASE: 0.025,            // base cone radians
  ATTACK_SPREAD_PLAYER_VEL: 0.014,      // extra spread per m/s of player horizontal speed
  ATTACK_SPREAD_BURST: 0.012,           // grows per shot in sustained fire
  ATTACK_SPREAD_MAX: 0.22,
  BURST_RESET: 0.55,                    // seconds without firing → spray pattern resets
  SPOTTING_DELAY: 0.35,                 // CS-like reaction lag before first shot after spotting

  REACTION_TIME: 0.25,
  WAYPOINT_TOLERANCE: 1.5,
  SEARCH_DURATION: 6,
  RESPAWN_DELAY: 4.5,

  // Movement / pathfinding
  STUCK_REPATH_TIME: 1.2,               // if not progressing for this long, repath
}

export const MATCH = {
  RESPAWN_DELAY: 2.5,
  BOT_COUNT: 4,
  KILL_TARGET: 20,
}

export const RENDER = {
  FOG_NEAR: 40,
  FOG_FAR: 180,
  FOG_COLOR: '#1c2230',
  AMBIENT_COLOR: '#525a6e',
  KEY_COLOR: '#f4f8ff',
  RIM_COLOR: '#ff7a3d',
  SHADOW_MAP_SIZE: 1024,
}

export const COLLISION = {
  // Group/mask membership: 16-bit groups, 16-bit filter
  // bit 0: world  | bit 1: player  | bit 2: bot  | bit 3: bullet
  GROUP_WORLD:  0b0001,
  GROUP_PLAYER: 0b0010,
  GROUP_BOT:    0b0100,
}
