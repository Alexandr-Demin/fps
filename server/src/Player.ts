import type { WebSocket } from 'ws'
import type { Vec3, PlayerId } from '../../shared/src/protocol.js'

export class Player {
  pos: Vec3
  vel: Vec3 = [0, 0, 0]
  yaw = 0
  pitch = 0
  lastInputTick = 0
  joinedAt = Date.now()

  constructor(
    public id: PlayerId,
    public nickname: string,
    public ws: WebSocket,
    spawn: Vec3,
  ) {
    this.pos = [spawn[0], spawn[1], spawn[2]]
  }
}
