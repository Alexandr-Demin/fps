import { WebSocket } from 'ws'
import { Player } from './Player.js'
import { Bot, BOT_DEFAULTS } from './Bot.js'
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
  // Bots live inside `players` too (their Player has isBot=true). This
  // separate map is just the controllers — we walk it each tick to
  // step their AI without filtering players.values() every time.
  readonly bots = new Map<PlayerId, Bot>()
  private tickCount = 0
  private lastTickMs = Date.now()
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

  /**
   * Number of *human* players. Bots don't count toward the room cap
   * (the lobby UI says "8 / 16" meaning 8 humans of 16-cap), and they
   * don't keep an emptied arena alive from the lobby's GC perspective
   * either — those checks all want humanCount, not total occupants.
   */
  get count(): number {
    let n = 0
    for (const p of this.players.values()) if (!p.isBot) n++
    return n
  }

  /** Total occupants including bots — used by Bot AI for target picks. */
  get totalCount(): number {
    return this.players.size
  }

  get state(): RoomState {
    return this.count >= this.maxPlayers ? 'playing' : 'waiting'
  }

  /**
   * Use the nickname of the lowest-id *human* player as the room label
   * so a bot-prefilled arena doesn't show up in the lobby as "BOT_00's
   * room". Falls back to "empty" if the room has no humans yet.
   */
  get hostName(): string {
    return this.hostPlayer?.nickname ?? 'empty'
  }

  /**
   * PlayerId of the current host, or null if no humans are present.
   * Used by clients to gate the host-only "PLAY AGAIN" button on the
   * end-screen.
   */
  get hostId(): PlayerId | null {
    return this.hostPlayer?.id ?? null
  }

  private get hostPlayer(): Player | null {
    let earliest: Player | null = null
    for (const p of this.players.values()) {
      if (p.isBot) continue
      if (!earliest || p.joinedAt < earliest.joinedAt) earliest = p
    }
    return earliest
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
    return this.count >= this.maxPlayers
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
      hostId: this.hostId,
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
    this.bots.delete(id) // no-op for humans
    console.log(`[room ${this.id}] player ${id} left, total=${this.count}`)
    this.broadcast({ t: 'playerLeft', id })
    this.onStateChange()
    return true
  }

  /**
   * Spawn N waypoint-AI bots into the room. Called by Lobby once when
   * the arena singleton is created. Bots show up to humans through the
   * same playerJoined / snapshot path as a human would.
   */
  addBots(count: number): void {
    for (let i = 0; i < count; i++) {
      const spawn = this.randomSpawn()
      const id = `bot_${this.id}_${i}`
      const nick = `BOT_${String(i).padStart(2, '0')}`
      const bot = new Bot(id, nick, spawn)
      this.players.set(id, bot)
      this.bots.set(id, bot)
      this.broadcast({ t: 'playerJoined', player: this.playerSnap(bot) })
      console.log(`[room ${this.id}] bot ${id} (${nick}) spawned`)
    }
    if (count > 0) this.onStateChange()
  }

  /**
   * Random spawn point — small helper so Bot.ts doesn't have to import
   * Player or know about the spawns array.
   */
  randomSpawn(): Vec3 {
    return this.spawns[Math.floor(Math.random() * this.spawns.length)]
  }

  /**
   * Bot AI calls these to fire a shot (broadcasts SFX) and to apply
   * the resulting hit (routes through the same damage / death / kill
   * book-keeping a human shooter would trigger). Kept as public hooks
   * so Bot.ts stays away from the private state machinery.
   */
  botShoot(attacker: Bot, origin: Vec3, dir: Vec3): void {
    if (this.phase !== 'playing') return
    this.broadcast({
      t: 'shotFired',
      shooter: attacker.id,
      origin,
      dir,
    })
  }

  botHit(
    attacker: Bot,
    targetId: PlayerId,
    damage: number,
    zone: 'head' | 'torso' | 'legs',
  ): void {
    this.onHit(attacker, targetId, damage, zone)
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
      case 'restartMatch':
        // Host-only, end-screen-only. Silently dropped otherwise — no
        // need to surface error UI for a stale button click.
        if (this.phase !== 'ended') break
        if (player.id !== this.hostId) break
        this.restartMatch()
        break
      // leaveRoom / lobby messages are handled by Lobby, not here.
    }
  }

  /**
   * Bring a finished match back to life in-place: phase → 'playing',
   * fresh match clock, everyone respawned to a random spawn with zeroed
   * stats. Called by the host clicking PLAY AGAIN on the end-screen.
   * Different from resetMatch (which only runs after evictAll has
   * already removed humans) — here humans are still in the room and
   * need explicit respawn broadcasts.
   */
  restartMatch(): void {
    this.phase = 'playing'
    this.endedAt = 0
    this.matchEndsAt =
      this.matchDurationMs != null ? Date.now() + this.matchDurationMs : null
    for (const p of this.players.values()) {
      p.kills = 0
      p.deaths = 0
      p.respawn(this.randomSpawn())
      this.broadcast({ t: 'respawned', id: p.id, pos: p.pos })
    }
    for (const bot of this.bots.values()) {
      bot.currentWaypoint = null
      bot.nextDecisionAt = 0
    }
    this.onStateChange()
  }

  tick() {
    this.tickCount++
    if (this.players.size === 0) return
    const now = Date.now()
    const dtMs = Math.max(1, now - this.lastTickMs)
    this.lastTickMs = now

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

      // Step bot AI after respawn handling so freshly-revived bots don't
      // wait a tick before resuming their patrol.
      for (const bot of this.bots.values()) bot.step(now, dtMs, this)
    }

    const players: PlayerSnap[] = []
    for (const p of this.players.values()) players.push(this.playerSnap(p))
    this.broadcast({
      t: 'snapshot',
      tick: this.tickCount,
      players,
      phase: this.phase,
      matchEndsAt: this.matchEndsAt,
      hostId: this.hostId,
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
    // Wipe stats. Bots stay in the room across matches, so they also
    // need a respawn back to a fresh point with full HP.
    for (const p of this.players.values()) {
      p.kills = 0
      p.deaths = 0
      if (p.isBot) p.respawn(this.randomSpawn())
    }
    // Bots get fresh navigation state so they don't keep heading to a
    // waypoint they picked during the previous match.
    for (const bot of this.bots.values()) {
      bot.currentWaypoint = null
      bot.nextDecisionAt = 0
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
      // Bots use their own respawn window (2s by default — long enough
      // that you visibly killed them, short enough that they're not
      // missing from the arena for an entire round).
      target.deadUntil =
        Date.now() + (target.isBot ? BOT_DEFAULTS.RESPAWN_MS : this.respawnMs)
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
      isBot: p.isBot,
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
