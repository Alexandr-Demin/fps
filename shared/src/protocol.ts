import type { MapData } from '../../src/core/mapTypes'

// Bump on any breaking protocol change. Clients with a different version
// are rejected at hello-time.
export const PROTOCOL_VERSION = 7
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

// Per-room cap. The plan calls for 2-player duel rooms; this constant lives
// in the protocol so client UI and server logic stay in sync.
export const MAX_PLAYERS_PER_ROOM = 2

export type RoomState = 'waiting' | 'playing'

export interface RoomSummary {
  id: RoomId
  hostName: string
  count: number
  max: number
  state: RoomState
  mode: GameMode
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
}

export type C2S =
  // Lobby (pre-room) messages
  | { t: 'hello'; v: number; nickname: string }
  | { t: 'createRoom'; mode: GameMode }
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
  | { t: 'roomJoined'; roomId: RoomId; mode: GameMode; map: MapData; tick: number; players: PlayerSnap[] }
  // After leaveRoom: dropped back into the lobby.
  | { t: 'roomLeft'; rooms: RoomSummary[] }
  | { t: 'reject'; reason: string }
  // In-room broadcasts
  | { t: 'playerJoined'; player: PlayerSnap }
  | { t: 'playerLeft'; id: PlayerId }
  | { t: 'snapshot'; tick: number; players: PlayerSnap[] }
  | { t: 'pong'; ts: number }
  | { t: 'damaged'; target: PlayerId; attacker: PlayerId; amount: number; hp: number; zone: HitZone }
  | { t: 'died'; target: PlayerId; attacker: PlayerId; respawnAt: number }
  | { t: 'respawned'; id: PlayerId; pos: Vec3 }
  | { t: 'shotFired'; shooter: PlayerId; origin: Vec3; dir: Vec3 }

export type { MapData }
