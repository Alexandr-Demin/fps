import type { MapData } from '../../src/core/mapTypes'

export const PROTOCOL_VERSION = 1
export type Vec3 = [number, number, number]
export type PlayerId = string

export interface PlayerSnap {
  id: PlayerId
  nickname: string
  pos: Vec3
  yaw: number
  pitch: number
}

export type C2S =
  | { t: 'hello'; v: number; nickname: string }
  | { t: 'input'; tick: number; pos: Vec3; vel: Vec3; yaw: number; pitch: number }
  | { t: 'ping'; ts: number }

export type S2C =
  | { t: 'welcome'; you: PlayerId; map: MapData; tick: number; players: PlayerSnap[] }
  | { t: 'reject'; reason: string }
  | { t: 'playerJoined'; player: PlayerSnap }
  | { t: 'playerLeft'; id: PlayerId }
  | { t: 'snapshot'; tick: number; players: PlayerSnap[] }
  | { t: 'pong'; ts: number }

export type { MapData }
