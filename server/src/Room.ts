import { WebSocket } from 'ws'
import { Player } from './Player.js'
import {
  type C2S,
  type S2C,
  type GameMode,
  type MatchResult,
  type PlayerSnap,
  type Vec3,
  type MapData,
  type PlayerId,
  type RoomId,
  type RoomPhase,
  type RoomState,
  type RoomSummary,
} from '../../shared/src/protocol.js'

// How long the end-screen overlay stays up before the server evicts
// players back to the lobby. Keep it short — long enough to read the
// top-5, short enough that nobody's stuck staring at a results board.
const ENDED_HOLD_MS = 10_000

// Defensive cap on a single client-reported hit. Real anti-cheat will come
// later; this is just a sanity bound so a typo / glitched packet can't reset
// HP to deeply negative in one shot.
const MAX_DAMAGE_PER_HIT = 200

/**
 * A single match room. Rooms are now created and managed by Lobby —
 * connections enter via Lobby's hello dance, and Lobby calls
 * `addPlayer` / `removePlayer` to attach/detach already-authenticated
 * sockets. The Room itself only worries about gameplay broadcast and
 * tick-time updates.
 */
export class Room {
  readonly players = new Map<PlayerId, Player>()
  private tickCount = 0
  private spawns: Vec3[]

  // Match-state machine. 'playing' from creation; flips to 'ended' when
  // the clock runs out (modes with a timer only), and back to 'playing'
  // on resetMatch() once the lobby has evicted the previous players.
  phase: RoomPhase = 'playing'
  // Epoch ms when the current match ends. null = no timer (duel).
  matchEndsAt: number | null = null
  // Epoch ms when phase flipped to 'ended'. Used to gate the eviction
  // window. 0 while phase === 'playing'.
  endedAt = 0

  constructor(
    public readonly id: RoomId,
    public readonly mode: GameMode,
    public readonly mapData: MapData,
    public readonly maxPlayers: number,
    // null for modes with no match timer (duel). For arena this is the
    // 5-minute clock from MODE_CONFIG.
    public readonly matchDurationMs: number | null,
    // Per-mode death timer. Duel keeps the long 4.5s respawn (gives the
    // surviving player a tangible window); arena drops to ~300ms so the
    // FFA feels continuous. Read by onHit when scheduling deadUntil.
    public readonly respawnMs: number,
    // Called whenever the room's composition changes (join, leave, full,
    // empty) so the Lobby can push a fresh roomList to other lobby
    // connections.
    private readonly onStateChange: () => void,
  ) {
    this.spawns = mapData.entities
      .filter((e: { kind: string }) => e.kind === 'playerSpawn')
      .map((e: { pos: Vec3 }) => e.pos as Vec3)
    if (this.spawns.length === 0) this.spawns.push([0, 2.5, 0])
    // Start the match clock immediately. Per the 4.4 plan we don't
    // gate match-start on having ≥2 players — that's a 4.7 concern
    // once bots can fill an empty arena.
    if (this.matchDurationMs != null) {
      this.matchEndsAt = Date.now() + this.matchDurationMs
    }
  }

  get count(): number {
    return this.players.size
  }

  get state(): RoomState {
    return this.players.size >= this.maxPlayers ? 'playing' : 'waiting'
  }

  /**
   * Use the nickname of the lowest-id player as the room label so the row
   * stays readable for joiners even after the original creator leaves.
   */
  get hostName(): string {
    let earliest: Player | null = null
    for (const p of this.players.values()) {
      if (!earliest || p.joinedAt < earliest.joinedAt) earliest = p
    }
    return earliest?.nickname ?? 'empty'
  }

  summary(): RoomSummary {
    const playerNames: string[] = []
    for (const p of this.players.values()) playerNames.push(p.nickname)
    return {
      id: this.id,
      hostName: this.hostName,
      count: this.count,
      max: this.maxPlayers,
      state: this.state,
      mode: this.mode,
      phase: this.phase,
      playerNames,
    }
  }

  isFull(): boolean {
    return this.players.size >= this.maxPlayers
  }

  /**
   * Attach an already-authenticated socket as a new player. Returns the
   * Player so the Lobby can update its connection→room mapping.
   * Caller must guard against `isFull()` and duplicate ids.
   */
  addPlayer(id: PlayerId, nickname: string, ws: WebSocket): Player {
    const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)]
    const player = new Player(id, nickname, ws, spawn)
    this.players.set(id, player)

    // Send room-joined to the new player.
    const playerList: PlayerSnap[] = Array.from(this.players.values()).map(
      (p) => this.playerSnap(p),
    )
    this.send(ws, {
      t: 'roomJoined',
      roomId: this.id,
      mode: this.mode,
      map: this.mapData,
      tick: this.tickCount,
      players: playerList,
      phase: this.phase,
      matchEndsAt: this.matchEndsAt,
    })

    // Notify existing players (everyone except the joiner).
    this.broadcast({ t: 'playerJoined', player: this.playerSnap(player) }, ws)

    console.log(
      `[room ${this.id}] player ${id} (${nickname}) joined, total=${this.count}`,
    )
    this.onStateChange()
    return player
  }

  /**
   * Detach a player from the room. Returns true if the player was actually
   * here. Lobby is responsible for the post-leave decision (delete the room
   * if empty, broadcast new lobby state, etc.).
   */
  removePlayer(id: PlayerId): boolean {
    if (!this.players.delete(id)) return false
    console.log(`[room ${this.id}] player ${id} left, total=${this.count}`)
    this.broadcast({ t: 'playerLeft', id })
    this.onStateChange()
    return true
  }

  /**
   * Handle an in-room message from one of this room's players. Lobby
   * routes message → Room.onMessage based on its connection→room map.
   */
  onMessage(player: Player, m: C2S) {
    switch (m.t) {
      case 'input':
        if (!player.alive) break
        player.pos = m.pos
        player.vel = m.vel
        player.yaw = m.yaw
        player.pitch = m.pitch
        player.state = m.state
        player.lastInputTick = m.tick
        break
      case 'ping':
        this.send(player.ws, { t: 'pong', ts: m.ts })
        break
      case 'hit':
        // Hits are silently dropped between matches — the end-screen is
        // showing, neither attacker nor target should be taking damage.
        if (this.phase !== 'playing') break
        this.onHit(player, m.target, m.damage, m.zone)
        break
      case 'shoot':
        if (!player.alive) break
        if (this.phase !== 'playing') break
        this.broadcast(
          { t: 'shotFired', shooter: player.id, origin: m.origin, dir: m.dir },
          player.ws,
        )
        break
      // leaveRoom / lobby messages are handled by Lobby, not here.
    }
  }

  tick() {
    this.tickCount++
    if (this.players.size === 0) return
    const now = Date.now()

    // Match-clock expiry. We don't bother with this when there's no
    // timer (duel) or when the previous expiry already flipped us into
    // 'ended' — the actual eviction is the lobby's job.
    if (
      this.phase === 'playing' &&
      this.matchEndsAt != null &&
      now >= this.matchEndsAt
    ) {
      this.phase = 'ended'
      this.endedAt = now
      this.matchEndsAt = null
      const results = this.buildLeaderboard()
      this.broadcast({ t: 'matchEnded', results })
      this.onStateChange()
    }

    // Respawn dead players whose timer has elapsed — only while the
    // match is live. During 'ended' players freeze where they died.
    if (this.phase === 'playing') {
      for (const p of this.players.values()) {
        if (!p.alive && now >= p.deadUntil) {
          const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)]
          p.respawn(spawn)
          this.broadcast({ t: 'respawned', id: p.id, pos: p.pos })
        }
      }
    }

    const players: PlayerSnap[] = []
    for (const p of this.players.values()) players.push(this.playerSnap(p))
    this.broadcast({
      t: 'snapshot',
      tick: this.tickCount,
      players,
      phase: this.phase,
      matchEndsAt: this.matchEndsAt,
    })
  }

  /**
   * Top-5 results, sorted by kills desc, ties broken by fewer deaths.
   * Called once when the match clock expires.
   */
  private buildLeaderboard(): MatchResult[] {
    const all: MatchResult[] = []
    for (const p of this.players.values()) {
      all.push({
        id: p.id,
        nickname: p.nickname,
        kills: p.kills,
        deaths: p.deaths,
      })
    }
    all.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    return all.slice(0, 5)
  }

  /**
   * True when the room has been sitting in 'ended' long enough for the
   * lobby to evict players back to the lobby screen.
   */
  shouldEvict(): boolean {
    return this.phase === 'ended' && Date.now() - this.endedAt >= ENDED_HOLD_MS
  }

  /**
   * Reset the room to a fresh-match state. Called by the lobby after
   * evicting the previous match's players, so the next person who
   * joins gets a full clock and zeroed stats.
   */
  resetMatch() {
    this.phase = 'playing'
    this.endedAt = 0
    this.matchEndsAt =
      this.matchDurationMs != null ? Date.now() + this.matchDurationMs : null
    // Any players still left (shouldn't be after eviction, but be
    // safe) get their stats wiped.
    for (const p of this.players.values()) {
      p.kills = 0
      p.deaths = 0
    }
  }

  private onHit(
    attacker: Player,
    targetId: PlayerId,
    damage: number,
    zone: 'head' | 'torso' | 'legs',
  ) {
    if (!attacker.alive) return
    const target = this.players.get(targetId)
    if (!target || !target.alive) return
    if (target === attacker) return // self-damage disabled
    // Spawn protection: damage silently dropped while the window is
    // open. Clients render the target with a flicker so the shooter
    // sees why their bullets didn't bite.
    if (Date.now() < target.spawnProtectedUntil) return

    const amount = Math.max(0, Math.min(MAX_DAMAGE_PER_HIT, Math.floor(damage)))
    if (amount === 0) return

    target.hp -= amount
    if (target.hp <= 0) {
      target.hp = 0
      target.alive = false
      target.deadUntil = Date.now() + this.respawnMs
      attacker.kills++
      target.deaths++
      this.broadcast({
        t: 'died',
        target: target.id,
        attacker: attacker.id,
        respawnAt: target.deadUntil,
      })
    } else {
      this.broadcast({
        t: 'damaged',
        target: target.id,
        attacker: attacker.id,
        amount,
        hp: target.hp,
        zone,
      })
    }
  }

  private playerSnap(p: Player): PlayerSnap {
    return {
      id: p.id,
      nickname: p.nickname,
      pos: p.pos,
      yaw: p.yaw,
      pitch: p.pitch,
      hp: p.hp,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
      state: p.state,
      protected: Date.now() < p.spawnProtectedUntil,
    }
  }

  private send(ws: WebSocket, msg: S2C) {
    if (ws.readyState !== WebSocket.OPEN) return
    try { ws.send(JSON.stringify(msg)) } catch {}
  }

  private broadcast(msg: S2C, except?: WebSocket) {
    const raw = JSON.stringify(msg)
    for (const p of this.players.values()) {
      if (p.ws === except) continue
      if (p.ws.readyState !== WebSocket.OPEN) continue
      try { p.ws.send(raw) } catch {}
    }
  }
}
