import type { WebSocket } from 'ws'
import type { Vec3, PlayerId, PlayerState } from '../../shared/src/protocol.js'
import { MP_MAX_HP, SPAWN_PROTECTION_MS } from '../../shared/src/protocol.js'

export class Player {
  pos: Vec3
  vel: Vec3 = [0, 0, 0]
  yaw = 0
  pitch = 0
  state: PlayerState = 'standing'
  lastInputTick = 0
  joinedAt = Date.now()

  hp = MP_MAX_HP
  kills = 0
  deaths = 0
  alive = true
  // ms timestamp (Date.now()) when this dead player should respawn.
  deadUntil = 0
  // ms timestamp through which incoming damage is ignored. Set on the
  // first spawn (this constructor) and on every respawn. 0 = no
  // protection.
  spawnProtectedUntil = 0

  constructor(
    public id: PlayerId,
    public nickname: string,
    public ws: WebSocket,
    spawn: Vec3,
  ) {
    this.pos = [spawn[0], spawn[1], spawn[2]]
    this.spawnProtectedUntil = Date.now() + SPAWN_PROTECTION_MS
  }

  respawn(at: Vec3) {
    this.pos = [at[0], at[1], at[2]]
    this.vel = [0, 0, 0]
    this.state = 'standing'
    this.hp = MP_MAX_HP
    this.alive = true
    this.deadUntil = 0
    this.spawnProtectedUntil = Date.now() + SPAWN_PROTECTION_MS
  }
}
