import type { MapData } from '../../src/core/mapTypes'

// Bump on any breaking protocol change. Clients with a different version
// are rejected at hello-time.
export const PROTOCOL_VERSION = 5
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
  // Server-authoritative velocity from the latest sim tick. Clients use
  // this to interp remote players over the snapshot gap; for the local
  // player it's mostly informational (we have our predicted velocity).
  vel: Vec3
  yaw: number
  pitch: number
  hp: number
  kills: number
  deaths: number
  alive: boolean
  // Tick of the last input command the server consumed from THIS player.
  // Returned for every player in every snapshot so the receiving client
  // can find its own ack and reconcile against the matching buffered
  // command. Snapshots arrive ~30Hz; the ack lets the client compute
  // `serverPos[ackTick]` and replay all later locally-applied inputs.
  ackedTick: number
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
  // In-room messages.
  // Phase 3 step 5: protocol switched from position-authoritative ('pos'
  // / 'vel' carried by the client) to input-authoritative. The server
  // re-runs the same fixed-step sim that the client predicts with and
  // returns its authoritative position via snapshot.ackedTick.
  | {
      t: 'input'
      tick: number
      yaw: number
      pitch: number
      forward: number       // -1, 0, 1
      strafe: number        // -1, 0, 1
      sprintHeld: boolean
      crouchHeld: boolean
      jumpEdge: boolean     // true only on the tick the press started
      crouchEdge: boolean   // ditto
    }
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
