// Map data schema — the editor and the runtime renderer both consume this.
// Single source of truth for level geometry, spawn points, and waypoints.

import type { PlayerState } from '../../shared/src/protocol'

export type Vec3Tuple = [number, number, number]

export type EntityKind =
  | 'concrete'
  | 'metal'
  | 'playerSpawn'
  | 'botSpawn'
  | 'waypoint'
  | 'targetDummy'

interface BaseEntity {
  id: string
  kind: EntityKind
  pos: Vec3Tuple
}

export interface ConcreteEntity extends BaseEntity {
  kind: 'concrete'
  size: Vec3Tuple
  color?: string
}

export interface MetalEntity extends BaseEntity {
  kind: 'metal'
  size: Vec3Tuple
  color?: string
  emissive?: string
  emissiveIntensity?: number
}

export interface PlayerSpawnEntity extends BaseEntity {
  kind: 'playerSpawn'
}

export interface BotSpawnEntity extends BaseEntity {
  kind: 'botSpawn'
}

export interface WaypointEntity extends BaseEntity {
  kind: 'waypoint'
}

// Static practice-range dummy — rendered as a posed capsule with a sensor
// collider, just enough to test hit-zone resolution against the standing /
// crouching / sliding silhouettes without needing another live player in
// the room. Not part of normal gameplay maps; lives only on test maps.
export interface TargetDummyEntity extends BaseEntity {
  kind: 'targetDummy'
  state: PlayerState
  yaw?: number
  label?: string
}

export type MapEntity =
  | ConcreteEntity
  | MetalEntity
  | PlayerSpawnEntity
  | BotSpawnEntity
  | WaypointEntity
  | TargetDummyEntity

export interface MapData {
  name: string
  entities: MapEntity[]
  fog?: { near: number; far: number; color: string }
  // Practice / sandbox maps set this to suppress the default SP BotSwarm
  // — the dev fixtures don't want random bots wandering into the test
  // pad. Normal gameplay maps leave it undefined.
  noBots?: boolean
}

// === Type guards ===

export const isBoxEntity = (e: MapEntity): e is ConcreteEntity | MetalEntity =>
  e.kind === 'concrete' || e.kind === 'metal'

export const isMarkerEntity = (
  e: MapEntity
): e is PlayerSpawnEntity | BotSpawnEntity | WaypointEntity =>
  e.kind === 'playerSpawn' || e.kind === 'botSpawn' || e.kind === 'waypoint'

// === Helpers ===

let _idSeq = 0
export function nextEntityId(prefix: string = 'e'): string {
  _idSeq++
  return `${prefix}_${Date.now().toString(36)}_${_idSeq}`
}

export function filterByKind<K extends EntityKind>(
  entities: MapEntity[],
  kind: K
): Extract<MapEntity, { kind: K }>[] {
  return entities.filter((e) => e.kind === kind) as Extract<MapEntity, { kind: K }>[]
}
