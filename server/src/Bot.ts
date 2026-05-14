import type { WebSocket } from 'ws'
import { Player } from './Player.js'
import type { Room } from './Room.js'
import type { PlayerId, Vec3 } from '../../shared/src/protocol.js'
import { raycastAgainstMap } from '../../shared/src/raycast.js'

// Bot tuning. Conservative on purpose — bots are a test rig, not a
// challenging opponent. Easy to leave alive during a 16-player match
// without dominating the leaderboard.
const BOT_SPEED = 4              // m/s, horizontal
const BOT_DECISION_MS = 500      // throttle target-pick / shoot decisions
const BOT_SIGHT_RANGE = 25       // m
const BOT_DAMAGE = 25            // per shot (single hit, torso-baseline)
const BOT_RESPAWN_MS = 2000      // between instant and duel-long
const WAYPOINT_REACHED_M = 0.5

/**
 * Fake WebSocket the bot Player carries — never opens, never sends.
 * Room.send / broadcast check ws.readyState before calling .send(), so
 * setting readyState=3 (CLOSED) makes the bot inert on the network
 * side without any special-casing in Room.
 */
function makeFakeWs(): WebSocket {
  return {
    readyState: 3, // CLOSED
    send: () => {},
    close: () => {},
    on: () => {},
    once: () => {},
    removeListener: () => {},
  } as unknown as WebSocket
}

/**
 * Waypoint-AI bot. Lives in Room.players as a Player with isBot=true,
 * plus a per-bot controller stashed in Room.bots that drives its
 * navigation and shooting each tick. Server-side, no Rapier — pure
 * arithmetic against MapData waypoint markers and an AABB-vs-segment
 * line-of-sight check.
 */
export class Bot extends Player {
  override isBot = true

  // Navigation state.
  currentWaypoint: Vec3 | null = null
  // Decision throttle so the bot doesn't think every server tick.
  nextDecisionAt = 0
  // Anti-stuck: if we sit on the same waypoint for too long, repath.
  pickedWaypointAt = 0

  constructor(id: PlayerId, nickname: string, spawn: Vec3) {
    super(id, nickname, makeFakeWs(), spawn)
  }

  /**
   * Per-tick AI step. Called by Room.tick() for each live bot.
   *   `now` is Date.now() captured once per tick by the caller so all
   *   bots in a single tick share the same clock.
   *   `dtMs` is the tick interval (~33ms at 30Hz).
   */
  step(now: number, dtMs: number, room: Room): void {
    if (!this.alive) return

    // ===== Movement =====
    if (this.currentWaypoint == null || now - this.pickedWaypointAt > 8000) {
      this.pickWaypoint(room)
    }
    if (this.currentWaypoint) {
      const dx = this.currentWaypoint[0] - this.pos[0]
      const dz = this.currentWaypoint[2] - this.pos[2]
      const dist = Math.hypot(dx, dz)
      if (dist < WAYPOINT_REACHED_M) {
        this.pickWaypoint(room)
      } else {
        const step = BOT_SPEED * (dtMs / 1000)
        const nx = dx / dist
        const nz = dz / dist
        // Move in XZ only — bots don't deal with terrain Y; their feet
        // stay at whatever Y the spawn point gave them.
        this.pos = [this.pos[0] + nx * step, this.pos[1], this.pos[2] + nz * step]
        this.vel = [nx * BOT_SPEED, 0, nz * BOT_SPEED]
        this.yaw = Math.atan2(nx, nz)
      }
    }

    // ===== Shooting =====
    if (now < this.nextDecisionAt) return
    this.nextDecisionAt = now + BOT_DECISION_MS

    const target = this.pickTarget(now, room)
    if (!target) return

    // LoS check against world geometry. Skip the shot if the line is
    // blocked — we don't want bots wallhacking even at this toy AI
    // level.
    const from: Vec3 = [this.pos[0], this.pos[1] + 0.5, this.pos[2]]
    const to: Vec3 = [target.pos[0], target.pos[1] + 0.5, target.pos[2]]
    const blocked = raycastAgainstMap(room.mapData, from, to).blocked
    if (blocked) return

    // Aim at target. Bots aren't required to face the right direction
    // before firing — they snap to it on the shot tick. Pitch
    // simulates looking up/down toward the human.
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const dz = to[2] - from[2]
    const flat = Math.hypot(dx, dz)
    this.yaw = Math.atan2(dx, dz)
    this.pitch = -Math.atan2(dy, flat)

    const len = Math.hypot(dx, dy, dz) || 1
    const dir: Vec3 = [dx / len, dy / len, dz / len]

    // Fire: broadcast a shotFired for SFX, apply hit directly. We hand
    // the damage to Room.botHit() so it shares the same death /
    // damaged / leaderboard plumbing as human shots.
    room.botShoot(this, from, dir)
    room.botHit(this, target.id, BOT_DAMAGE, 'torso')
  }

  private pickWaypoint(room: Room): void {
    const wps = room.mapData.entities.filter(
      (e: { kind: string }) => e.kind === 'waypoint',
    ) as Array<{ pos: Vec3 }>
    if (wps.length === 0) {
      // No waypoints on this map — fall back to wandering around the
      // spawn point so bots aren't statues.
      this.currentWaypoint = [
        this.pos[0] + (Math.random() - 0.5) * 10,
        this.pos[1],
        this.pos[2] + (Math.random() - 0.5) * 10,
      ]
    } else {
      const wp = wps[Math.floor(Math.random() * wps.length)]
      // Treat the waypoint as an XZ target; keep our own Y so we don't
      // dive into the floor if the marker was placed at ground level.
      this.currentWaypoint = [wp.pos[0], this.pos[1], wp.pos[2]]
    }
    this.pickedWaypointAt = Date.now()
  }

  private pickTarget(now: number, room: Room): Player | null {
    let best: Player | null = null
    let bestDist2 = BOT_SIGHT_RANGE * BOT_SIGHT_RANGE
    for (const p of room.players.values()) {
      if (p === this) continue
      if (p.isBot) continue // bot-vs-bot disabled — keeps tests meaningful
      if (!p.alive) continue
      if (now < p.spawnProtectedUntil) continue
      const dx = p.pos[0] - this.pos[0]
      const dy = p.pos[1] - this.pos[1]
      const dz = p.pos[2] - this.pos[2]
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < bestDist2) {
        best = p
        bestDist2 = d2
      }
    }
    return best
  }
}

// Per-mode bot lifecycle helpers — kept here so Room doesn't need to
// know about waypoint AI internals.
export const BOT_DEFAULTS = {
  RESPAWN_MS: BOT_RESPAWN_MS,
}
