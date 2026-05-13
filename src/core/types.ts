import type { Vector3Tuple } from 'three'

export type Vec3 = Vector3Tuple

export type GamePhase =
  | 'menu' | 'levelSelect' | 'playing' | 'dead' | 'paused' | 'editor'
  | 'mpConnect' | 'mpConnecting' | 'mpLobby'
  | 'mpPlaying' | 'mpPaused' | 'mpDead'

export type BotState = 'idle' | 'patrol' | 'chase' | 'attack' | 'search' | 'dead'

export interface BotSnapshot {
  id: number
  hp: number
  state: BotState
  position: Vec3
}

export interface ImpactFx {
  id: number
  position: Vec3
  normal: Vec3
  life: number
  bot?: boolean
}

export interface MuzzleFlashFx {
  id: number
  life: number
}

export type HitZone = 'HEAD' | 'TORSO' | 'LEGS'

export interface HitEvent {
  id: number
  zone: HitZone
  damage: number
  killed: boolean
  life: number   // seconds remaining for the log entry
  // MP only: remote-player id of the victim, so a delayed server-side
  // `died` event can retroactively flip `killed` on the right entry.
  target?: string
}

export interface HitTotals {
  head: number
  torso: number
  legs: number
  totalDamage: number
  kills: number
  shots: number
  bodyHits: number  // any shot that hit a bot
}
