import type { MapData } from '../../src/core/mapTypes'

// Bump on any breaking protocol change. Clients with a different version
// are rejected at hello-time.
export const PROTOCOL_VERSION = 10
export type Vec3 = [number, number, number]
export type PlayerId = string
export type RoomId = string
export type HitZone = 'head' | 'torso' | 'legs'

// Per-player movement state. Drives hitbox selection on the server (in
// future steps) and remote-model rendering on the client (lower capsule
// when crouched, tilted-forward capsule when sliding).
export type PlayerState = 'standing' | 'crouching' | 'sliding'

// Match mode. Selected at room-create time and immutable for the room's
// lifetime; per-mode tunings (room cap, respawn cadence, match length)
// live server-side in modes.ts.
//
//   - 'duel'  — 1v1 fast-respawn-disabled style, 2-player cap.
//   - 'arena' — 16-player FFA, near-instant respawns, timed match.
//
// Bookkeeping fields for arena (match timer, end leaderboard) come in
// later phase-4 steps and don't exist yet.
export type GameMode = 'duel' | 'arena'

export const MP_MAX_HP = 100
export const MP_RESPAWN_MS = 4500

// Post-respawn invulnerability window. Long enough to recover bearings
// after a frantic arena respawn, short enough that it doesn't become a
// safe-camp aura.
export const SPAWN_PROTECTION_MS = 1500

// Per-room cap. The plan calls for 2-player duel rooms; this constant lives
// in the protocol so client UI and server logic stay in sync.
export const MAX_PLAYERS_PER_ROOM = 2

export type RoomState = 'waiting' | 'playing'

// Match phase. Drives end-of-match overlay and timer display.
//   - 'playing' — match is live, hits resolve normally.
//   - 'ended'   — match clock hit zero, end-screen visible, hits muted,
//                 server will evict players back to the lobby ~10s later.
//   - 'waiting' — reserved for future use (pre-match countdown in
//                 step 4.7 once bots can fill an empty arena).
// Duel rooms have no timer (MODE_CONFIG.matchDurationMs is null) and
// stay in 'playing' for their entire lifetime.
export type RoomPhase = 'waiting' | 'playing' | 'ended'

// One entry in the end-of-match leaderboard.
export interface MatchResult {
  id: PlayerId
  nickname: string
  kills: number
  deaths: number
}

export interface RoomSummary {
  id: RoomId
  hostName: string
  count: number
  max: number
  state: RoomState
  mode: GameMode
  // Match phase, used by the lobby to show ENDED / etc badges. Duel
  // rooms always report 'playing'.
  phase: RoomPhase
  // Pre-join roster — used by the arena lobby to show who's already in
  // the singleton arena room before you join. Included for every room
  // (duel rooms also carry it; the duel UI just doesn't render it).
  playerNames: string[]
}

export interface PlayerSnap {
  id: PlayerId
  nickname: string
  pos: Vec3
  yaw: number
  pitch: number
  hp: number
  kills: number
  deaths: number
  alive: boolean
  state: PlayerState
  // True during the spawn-protection window. Server gates damage on the
  // authoritative timer; the field is mirrored to clients so remote
  // models can render semi-transparent / flickering and the local HUD
  // can show a PROTECTED pill.
  protected: boolean
  // True for waypoint-AI bots. Client uses this for the [BOT] nickname
  // prefix and a slightly different capsule colour. Bots never carry a
  // WebSocket on the server side.
  isBot: boolean
}

export type C2S =
  // Lobby (pre-room) messages
  | { t: 'hello'; v: number; nickname: string }
  // Bot count is a hint, honoured only for arena (duel is human-only)
  // and only when the room is created — once the singleton arena
  // exists, subsequent createRoom messages just join it. Range 0–8.
  | { t: 'createRoom'; mode: GameMode; botCount?: number }
  | { t: 'joinRoom'; roomId: RoomId }
  // Optional explicit leave back to lobby. Closing the socket also drops
  // the player from the room — this message is for a graceful "back to
  // lobby" button without reconnecting.
  | { t: 'leaveRoom' }
  // In-room messages
  | { t: 'input'; tick: number; pos: Vec3; vel: Vec3; yaw: number; pitch: number; state: PlayerState }
  | { t: 'ping'; ts: number }
  | { t: 'hit'; target: PlayerId; damage: number; zone: HitZone }
  | { t: 'shoot'; origin: Vec3; dir: Vec3 }

export type S2C =
  // Lobby (pre-room) messages
  | { t: 'lobbyWelcome'; you: PlayerId; rooms: RoomSummary[] }
  | { t: 'roomList'; rooms: RoomSummary[] }
  // After createRoom / joinRoom: now you're in the room. Contains the same
  // info the pre-lobby `welcome` used to carry.
  | {
      t: 'roomJoined'
      roomId: RoomId
      mode: GameMode
      map: MapData
      tick: number
      players: PlayerSnap[]
      // Match phase at join-time; clients render the end-screen if
      // they happen to join while phase === 'ended'.
      phase: RoomPhase
      // Epoch ms when the current match ends. null when the mode has
      // no timer (duel) or when phase is 'ended' (no match running).
      matchEndsAt: number | null
    }
  // After leaveRoom: dropped back into the lobby.
  | { t: 'roomLeft'; rooms: RoomSummary[] }
  | { t: 'reject'; reason: string }
  // In-room broadcasts
  | { t: 'playerJoined'; player: PlayerSnap }
  | { t: 'playerLeft'; id: PlayerId }
  | {
      t: 'snapshot'
      tick: number
      players: PlayerSnap[]
      // Carried every tick so a client that joins mid-match or briefly
      // disconnects gets a fresh authoritative clock and phase. null if
      // mode has no timer / between matches.
      phase: RoomPhase
      matchEndsAt: number | null
    }
  | { t: 'pong'; ts: number }
  | { t: 'damaged'; target: PlayerId; attacker: PlayerId; amount: number; hp: number; zone: HitZone }
  | { t: 'died'; target: PlayerId; attacker: PlayerId; respawnAt: number }
  | { t: 'respawned'; id: PlayerId; pos: Vec3 }
  | { t: 'shotFired'; shooter: PlayerId; origin: Vec3; dir: Vec3 }
  // Broadcast once when the match clock expires. `results` is sorted
  // by kills desc, then deaths asc, top-5 only. Triggers the
  // MpEndScreen overlay; server evicts players back to the lobby ~10s
  // after this event.
  | { t: 'matchEnded'; results: MatchResult[] }

export type { MapData }
