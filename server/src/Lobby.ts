import { WebSocket } from 'ws'
import { Room } from './Room.js'
import { MODE_CONFIG } from './modes.js'
import {
  PROTOCOL_VERSION,
  type C2S,
  type S2C,
  type GameMode,
  type MapData,
  type PlayerId,
  type RoomId,
  type RoomSummary,
} from '../../shared/src/protocol.js'

interface Connection {
  id: PlayerId
  nickname: string
  ws: WebSocket
  // null = in lobby; non-null = in this room. A connection is in one or
  // the other at any moment.
  room: Room | null
}

/**
 * Top-level matchmaker. Owns the set of active rooms, runs each room's
 * tick, manages connection → room routing, and broadcasts the room list
 * to lobby connections on any composition change.
 *
 * Connection state machine:
 *   open → hello → lobby → (createRoom | joinRoom) → in-room
 *   in-room → (leaveRoom | socket close) → lobby (or terminate if close)
 *
 * Per the friends-only tier scope: no auth, no persistence, no private
 * rooms, no codes — just an open list of waiting rooms.
 */
export class Lobby {
  private readonly connections = new Map<WebSocket, Connection>()
  private readonly rooms = new Map<RoomId, Room>()
  private nextPlayerSeq = 0
  private nextRoomSeq = 0
  // Debounce roomList broadcasts: many state changes can land in a single
  // tick (e.g. two players join, fill, both leave). Coalesce them into one
  // setImmediate-flushed broadcast so we don't fan out N nearly-identical
  // payloads.
  private listBroadcastPending = false

  constructor(
    private readonly mapData: MapData,
    // Optional cap override. When set, both DUEL and ARENA rooms use
    // this number instead of the per-mode default — primarily so the
    // load-test harness can squeeze N synthetic clients into a single
    // room regardless of the mode it created. In normal operation this
    // stays unset and Lobby reads the cap from MODE_CONFIG.
    private readonly maxPlayersOverride: number | null = null,
    // Number of bots to drop into the arena on first creation. Set via
    // the BOT_COUNT env var on the server (see index.ts) — useful for
    // soloing the arena or smoke-testing with low player counts.
    // Clamped to [0, 8].
    private readonly arenaBotCount: number = 0,
  ) {}

  onConnection(ws: WebSocket) {
    let registered = false
    const helloTimer = setTimeout(() => {
      if (!registered) {
        try { ws.close() } catch {}
      }
    }, 3000)

    ws.on('error', (err) => {
      console.error('[lobby] ws error:', err)
    })

    ws.once('message', (raw) => {
      if (registered) return
      clearTimeout(helloTimer)

      let msg: C2S
      try {
        msg = JSON.parse(raw.toString()) as C2S
      } catch {
        try { ws.close() } catch {}
        return
      }
      if (msg.t !== 'hello') {
        this.sendReject(ws, 'expected hello')
        try { ws.close() } catch {}
        return
      }
      if (msg.v !== PROTOCOL_VERSION) {
        this.sendReject(
          ws,
          `protocol mismatch: server=${PROTOCOL_VERSION}, client=${msg.v}`,
        )
        try { ws.close() } catch {}
        return
      }

      registered = true
      const id = 'p_' + ++this.nextPlayerSeq
      const nickname =
        (msg.nickname && msg.nickname.trim().slice(0, 16)) || 'PLAYER_' + id

      const conn: Connection = { id, nickname, ws, room: null }
      this.connections.set(ws, conn)
      console.log(
        `[lobby] connection ${id} (${nickname}) joined the lobby, ` +
        `lobby-size=${this.lobbySize()}, rooms=${this.rooms.size}`,
      )

      // Send the lobby snapshot.
      this.send(ws, {
        t: 'lobbyWelcome',
        you: id,
        rooms: this.roomSummaries(),
      })

      ws.on('message', (data) => this.handleClientMessage(conn, data))
      ws.on('close', () => this.handleClose(conn))
    })
  }

  /**
   * Aggregate counts for the perf logger in index.ts — kept as a method
   * rather than exposing the private maps directly.
   */
  stats(): { rooms: number; players: number; connections: number } {
    let players = 0
    for (const r of this.rooms.values()) players += r.count
    return {
      rooms: this.rooms.size,
      players,
      connections: this.connections.size,
    }
  }

  /**
   * Per-tick advance for every active room. Called from index.ts at
   * TICK_RATE Hz. Empty rooms are pruned here so a flap of join → leave
   * doesn't leave zombie rooms behind.
   */
  tick() {
    for (const r of this.rooms.values()) {
      r.tick()
      if (r.shouldEvict()) this.evictAll(r)
    }
    // Garbage-collect empty rooms (in case removePlayer leaves one alive
    // but unreachable). Not strictly necessary — handleClose / leaveRoom
    // already do it — but cheap insurance. Arena is exempt: it's the
    // singleton landing pad, players need to see it sitting at 0/16
    // before they join.
    for (const [id, r] of this.rooms) {
      if (r.count === 0 && r.mode !== 'arena') {
        this.rooms.delete(id)
        this.scheduleRoomListBroadcast()
      }
    }
  }

  /**
   * End-of-match cleanup: kick every player in `room` back into the
   * lobby (so their UI surfaces the end-screen-then-back-to-lobby
   * transition), and reset the room so the next match starts fresh.
   * Used by the per-tick check against Room.shouldEvict().
   */
  private evictAll(room: Room) {
    const ws2conn = this.connections
    const sendRoomLeft = () => {
      // Recompute summaries once for everyone. Players being kicked
      // see the room they were in still listed (arena) or removed
      // (duel) on the next pass once removePlayer / resetMatch runs.
      const rooms = this.roomSummaries()
      for (const id of toEvict) {
        const conn = byPlayerId.get(id)
        if (!conn) continue
        if (conn.ws.readyState !== WebSocket.OPEN) continue
        try { conn.ws.send(JSON.stringify({ t: 'roomLeft', rooms })) } catch {}
      }
    }

    const toEvict: PlayerId[] = []
    const byPlayerId = new Map<PlayerId, Connection>()
    for (const conn of ws2conn.values()) {
      if (conn.room === room) {
        toEvict.push(conn.id)
        byPlayerId.set(conn.id, conn)
      }
    }

    for (const id of toEvict) {
      const conn = byPlayerId.get(id)
      if (!conn) continue
      conn.room = null
      room.removePlayer(id)
    }

    // For duel rooms, the per-room destruction path runs below (count
    // drops to 0 → GC). For arena, the room persists; reset the clock
    // so the next JOIN gets a fresh match.
    if (room.mode === 'arena') room.resetMatch()

    sendRoomLeft()
    this.scheduleRoomListBroadcast()
  }

  private handleClientMessage(conn: Connection, data: import('ws').RawData) {
    let m: C2S
    try { m = JSON.parse(data.toString()) as C2S } catch { return }

    // hello after registration is ignored.
    if (m.t === 'hello') return

    if (conn.room) {
      // In-room: most messages flow through to the room. leaveRoom is
      // handled here so the room doesn't need lobby awareness.
      if (m.t === 'leaveRoom') {
        this.moveToLobby(conn)
        return
      }
      const player = conn.room.players.get(conn.id)
      if (player) conn.room.onMessage(player, m)
      return
    }

    // Lobby-phase messages.
    switch (m.t) {
      case 'createRoom':
        this.createRoomForConnection(conn, m.mode)
        break
      case 'joinRoom':
        this.joinRoomForConnection(conn, m.roomId)
        break
      case 'leaveRoom':
        // No-op — already in lobby. Resend current list so the client UI
        // can rehydrate if it was waiting on something.
        this.send(conn.ws, { t: 'roomLeft', rooms: this.roomSummaries() })
        break
      default:
        // ignore (ping/input/hit/shoot in lobby phase are meaningless)
        break
    }
  }

  private handleClose(conn: Connection) {
    this.connections.delete(conn.ws)
    if (conn.room) {
      const room = conn.room
      conn.room = null
      room.removePlayer(conn.id)
      // Arena is persistent — it's the landing pad for the singleton
      // arena lobby and stays visible at 0/16 even when empty.
      if (room.count === 0 && room.mode !== 'arena') {
        this.rooms.delete(room.id)
      }
      this.scheduleRoomListBroadcast()
    }
    console.log(
      `[lobby] connection ${conn.id} (${conn.nickname}) closed, ` +
      `lobby-size=${this.lobbySize()}, rooms=${this.rooms.size}`,
    )
  }

  private createRoomForConnection(conn: Connection, mode: GameMode) {
    if (conn.room) return // shouldn't happen — guarded above
    // Guard against a client sending an unexpected mode string. Reject
    // instead of silently defaulting — saves a lot of confusion when
    // diagnosing capacity issues later.
    const cfg = MODE_CONFIG[mode]
    if (!cfg) {
      this.send(conn.ws, { t: 'reject', reason: `unknown mode: ${mode}` })
      return
    }

    // Arena is a single shared room — clients clicking "JOIN ARENA"
    // route through the same createRoom message, and we either reuse
    // the persistent arena room or spin it up the first time. Duel
    // rooms keep the per-create-call lifecycle.
    if (mode === 'arena') {
      const arena = this.getOrCreateArenaRoom()
      if (arena.isFull()) {
        this.send(conn.ws, { t: 'reject', reason: 'arena full' })
        this.send(conn.ws, { t: 'roomList', rooms: this.roomSummaries() })
        return
      }
      arena.addPlayer(conn.id, conn.nickname, conn.ws)
      conn.room = arena
      return
    }

    const maxPlayers = this.maxPlayersOverride ?? cfg.maxPlayers
    const id = 'r_' + ++this.nextRoomSeq
    const room = new Room(
      id, mode, this.mapData, maxPlayers,
      cfg.matchDurationMs, cfg.respawnMs,
      () => this.scheduleRoomListBroadcast(),
    )
    this.rooms.set(id, room)
    room.addPlayer(conn.id, conn.nickname, conn.ws)
    conn.room = room
    console.log(
      `[lobby] room ${id} (${mode}, cap=${maxPlayers}) created by ${conn.nickname}, rooms=${this.rooms.size}`,
    )
    // addPlayer already triggers onStateChange → scheduleRoomListBroadcast
  }

  /**
   * Returns the shared arena room, creating it lazily on the first join.
   * The room is never garbage-collected when empty — it stays in the
   * lobby so newcomers can see "0 / 16, WAITING" rather than nothing at
   * all. Duel rooms keep the old per-room lifecycle (empty → deleted).
   */
  private getOrCreateArenaRoom(): Room {
    for (const r of this.rooms.values()) {
      if (r.mode === 'arena') {
        // If the previous arena match already ended and the lobby just
        // hasn't gotten around to evicting yet (e.g. a fast JOIN), make
        // sure the new player drops into a fresh-match state rather
        // than into the 10s end-screen window.
        if (r.phase === 'ended') r.resetMatch()
        return r
      }
    }
    const cfg = MODE_CONFIG.arena
    const maxPlayers = this.maxPlayersOverride ?? cfg.maxPlayers
    const id = 'r_arena'
    const room = new Room(
      id, 'arena', this.mapData, maxPlayers,
      cfg.matchDurationMs, cfg.respawnMs,
      () => this.scheduleRoomListBroadcast(),
    )
    this.rooms.set(id, room)
    const botCount = Math.max(0, Math.min(8, this.arenaBotCount | 0))
    if (botCount > 0) room.addBots(botCount)
    console.log(
      `[lobby] arena room ${id} (cap=${maxPlayers}, durMs=${cfg.matchDurationMs}, bots=${botCount}) created on first join, rooms=${this.rooms.size}`,
    )
    return room
  }

  private joinRoomForConnection(conn: Connection, roomId: RoomId) {
    const room = this.rooms.get(roomId)
    if (!room) {
      this.send(conn.ws, { t: 'reject', reason: 'room not found' })
      this.send(conn.ws, { t: 'roomList', rooms: this.roomSummaries() })
      return
    }
    if (room.isFull()) {
      this.send(conn.ws, { t: 'reject', reason: 'room full' })
      this.send(conn.ws, { t: 'roomList', rooms: this.roomSummaries() })
      return
    }
    room.addPlayer(conn.id, conn.nickname, conn.ws)
    conn.room = room
  }

  /**
   * Drop the connection from its room back into the lobby. The socket
   * stays open — the client gets a fresh roomList and can pick a new
   * room without reconnecting.
   */
  private moveToLobby(conn: Connection) {
    if (!conn.room) return
    const room = conn.room
    conn.room = null
    room.removePlayer(conn.id)
    if (room.count === 0 && room.mode !== 'arena') {
      this.rooms.delete(room.id)
      this.scheduleRoomListBroadcast()
    }
    this.send(conn.ws, { t: 'roomLeft', rooms: this.roomSummaries() })
  }

  private roomSummaries(): RoomSummary[] {
    return Array.from(this.rooms.values()).map((r) => r.summary())
  }

  private lobbySize(): number {
    let n = 0
    for (const c of this.connections.values()) if (!c.room) n++
    return n
  }

  private scheduleRoomListBroadcast() {
    if (this.listBroadcastPending) return
    this.listBroadcastPending = true
    setImmediate(() => {
      this.listBroadcastPending = false
      const payload: S2C = { t: 'roomList', rooms: this.roomSummaries() }
      const raw = JSON.stringify(payload)
      for (const c of this.connections.values()) {
        if (c.room) continue // in-room players don't get lobby pushes
        if (c.ws.readyState !== WebSocket.OPEN) continue
        try { c.ws.send(raw) } catch {}
      }
    })
  }

  private send(ws: WebSocket, msg: S2C) {
    if (ws.readyState !== WebSocket.OPEN) return
    try { ws.send(JSON.stringify(msg)) } catch {}
  }

  private sendReject(ws: WebSocket, reason: string) {
    try { ws.send(JSON.stringify({ t: 'reject', reason } as S2C)) } catch {}
  }
}
