import type { MapData } from '../../src/core/mapTypes'

// Bump on any breaking protocol change. Clients with a different version
// are rejected at hello-time.
export const PROTOCOL_VERSION = 2
export type Vec3 = [number, number, number]
export type PlayerId = string
export type HitZone = 'head' | 'torso' | 'legs'

export const MP_MAX_HP = 100
export const MP_RESPAWN_MS = 4500

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
  | { t: 'hello'; v: number; nickname: string }
  | { t: 'input'; tick: number; pos: Vec3; vel: Vec3; yaw: number; pitch: number }
  | { t: 'ping'; ts: number }
  // Client-authoritative hit report. The shooter resolved the raycast and
  // computed damage; the server trusts (acceptable for the friends-only
  // tier — will tighten in Phase 3).
  | { t: 'hit'; target: PlayerId; damage: number; zone: HitZone }

export type S2C =
  | { t: 'welcome'; you: PlayerId; map: MapData; tick: number; players: PlayerSnap[] }
  | { t: 'reject'; reason: string }
  | { t: 'playerJoined'; player: PlayerSnap }
  | { t: 'playerLeft'; id: PlayerId }
  | { t: 'snapshot'; tick: number; players: PlayerSnap[] }
  | { t: 'pong'; ts: number }
  | { t: 'damaged'; target: PlayerId; attacker: PlayerId; amount: number; hp: number; zone: HitZone }
  | { t: 'died'; target: PlayerId; attacker: PlayerId; respawnAt: number }
  | { t: 'respawned'; id: PlayerId; pos: Vec3 }

export type { MapData }
