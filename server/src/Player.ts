import type { WebSocket } from 'ws'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Vec3, PlayerId } from '../../shared/src/protocol.js'
import { MP_MAX_HP } from '../../shared/src/protocol.js'
import {
  createPlayerCharacterController,
  createPlayerSimState,
  type PlayerInputCmd,
  type PlayerSimState,
} from '../../shared/src/sim/player-sim.js'
import { PLAYER_PHYS } from '../../shared/src/sim/constants.js'

/**
 * Server-side player. Owns:
 *   - networking state (id, nickname, ws)
 *   - gameplay state (hp, kills, deaths, alive)
 *   - simulation state (Rapier body + collider + character controller)
 *
 * The Rapier body lives in the parent Room's world. Lifecycle:
 * constructor allocates; `destroy()` removes from the world (Room calls
 * this when the player leaves or the room is being torn down).
 */
export class Player {
  joinedAt = Date.now()

  hp = MP_MAX_HP
  kills = 0
  deaths = 0
  alive = true
  deadUntil = 0

  // Simulation slot — populated in init() once we have a Rapier world.
  // Decoupled from constructor so callers can build the body with the
  // exact spawn we picked.
  sim!: PlayerSimState
  body!: RAPIER.RigidBody
  collider!: RAPIER.Collider
  controller!: RAPIER.KinematicCharacterController

  // Last input we consumed from this player. Echoed back in every
  // snapshot as `ackedTick` so the client can reconcile.
  lastAckedTick = 0
  // Queue of inputs received since the last sim tick. Server consumes
  // the most recent on tick (drops older).
  pendingInput: PlayerInputCmd | null = null

  constructor(
    public id: PlayerId,
    public nickname: string,
    public ws: WebSocket,
  ) {}

  /**
   * Spawn the player at `at` and wire up Rapier objects in the given world.
   * Returns this for chaining at the call site.
   */
  init(rapier: typeof RAPIER, world: RAPIER.World, at: Vec3): this {
    this.sim = createPlayerSimState(at)
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(at[0], at[1], at[2]),
    )
    this.collider = world.createCollider(
      rapier.ColliderDesc.capsule(
        PLAYER_PHYS.HEIGHT * 0.5 - PLAYER_PHYS.RADIUS,
        PLAYER_PHYS.RADIUS,
      ),
      this.body,
    )
    this.controller = createPlayerCharacterController(rapier, world)
    return this
  }

  /** Position from the Rapier body (single source of truth for snapshots). */
  get pos(): Vec3 {
    const t = this.body.translation()
    return [t.x, t.y, t.z]
  }

  get vel(): Vec3 {
    return [this.sim.vel[0], this.sim.vel[1], this.sim.vel[2]]
  }

  get yaw(): number { return this.sim.yaw }
  get pitch(): number { return this.sim.pitch }

  /**
   * Reset state for a respawn. Pos is set via Rapier directly so the
   * sim state's `pos` mirror is also refreshed.
   */
  respawn(at: Vec3) {
    this.body.setNextKinematicTranslation({ x: at[0], y: at[1], z: at[2] })
    this.body.setTranslation({ x: at[0], y: at[1], z: at[2] }, true)
    this.sim.pos[0] = at[0]
    this.sim.pos[1] = at[1]
    this.sim.pos[2] = at[2]
    this.sim.vel[0] = this.sim.vel[1] = this.sim.vel[2] = 0
    this.sim.grounded = false
    this.sim.sliding = false
    this.sim.slideTimer = 0
    this.sim.slideCooldown = 0
    this.sim.coyoteTimer = 0
    this.sim.lastLandAt = -999
    this.hp = MP_MAX_HP
    this.alive = true
    this.deadUntil = 0
    // We deliberately keep yaw/pitch — server will overwrite them on the
    // next input from the client anyway.
  }

  /** Free Rapier resources. Room calls this on leave / shutdown. */
  destroy(world: RAPIER.World) {
    try { world.removeCharacterController(this.controller) } catch {}
    try { world.removeRigidBody(this.body) } catch {}
  }
}
