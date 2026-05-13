import type { MapData } from '../../src/core/mapTypes'

// Bump on any breaking protocol change. Clients with a different version
// are rejected at hello-time.
export const PROTOCOL_VERSION = 4
export type Vec3 = [number, number, number]
export type PlayerId = string
export type RoomId = string
export type HitZone = 'head' | 'torso' | 'legs'

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
}

export type C2S =
  // Lobby (pre-room) messages
  | { t: 'hello'; v: number; nickname: string }
  | { t: 'createRoom' }
  | { t: 'joinRoom'; roomId: RoomId }
  // Optional explicit leave back to lobby. Closing the socket also drops
  // the player from the room — this message is for a graceful "back to
  // lobby" button without reconnecting.
  | { t: 'leaveRoom' }
  // In-room messages
  | { t: 'input'; tick: number; pos: Vec3; vel: Vec3; yaw: number; pitch: number }
  | { t: 'ping'; ts: number }
  | { t: 'hit'; target: PlayerId; damage: number; zone: HitZone }
  | { t: 'shoot'; origin: Vec3; dir: Vec3 }

export type S2C =
  // Lobby (pre-room) messages
  | { t: 'lobbyWelcome'; you: PlayerId; rooms: RoomSummary[] }
  | { t: 'roomList'; rooms: RoomSummary[] }
  // After createRoom / joinRoom: now you're in the room. Contains the same
  // info the pre-lobby `welcome` used to carry.
  | { t: 'roomJoined'; roomId: RoomId; map: MapData; tick: number; players: PlayerSnap[] }
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
