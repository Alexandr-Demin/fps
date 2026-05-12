import type { RigidBody, World } from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import { WEAPON } from '../../core/constants'

export interface HitscanHit {
  point: Vector3
  normal: Vector3
  distance: number
  colliderHandle: number
  isBot: boolean
  botId?: number
}

// Map of collider.handle → botId, populated by bots as they spawn.
const botColliderMap = new Map<number, number>()
export function registerBotCollider(handle: number, botId: number) {
  botColliderMap.set(handle, botId)
}
export function unregisterBotCollider(handle: number) {
  botColliderMap.delete(handle)
}

export function castHitscan(
  world: World,
  rapier: typeof import('@dimforge/rapier3d-compat'),
  origin: Vector3,
  direction: Vector3,
  excludeRigidBody?: RigidBody | null
): HitscanHit | null {
  const ray = new rapier.Ray(
    { x: origin.x, y: origin.y, z: origin.z },
    { x: direction.x, y: direction.y, z: direction.z }
  )
  const hit = world.castRayAndGetNormal(
    ray,
    WEAPON.RANGE,
    true,
    undefined,
    undefined,
    undefined,
    excludeRigidBody ?? undefined
  )
  if (!hit) return null
  const t = hit.timeOfImpact
  const point = new Vector3(
    origin.x + direction.x * t,
    origin.y + direction.y * t,
    origin.z + direction.z * t
  )
  const normal = new Vector3(hit.normal.x, hit.normal.y, hit.normal.z)
  const handle = (hit.collider as any).handle as number
  const isBot = botColliderMap.has(handle)
  return {
    point,
    normal,
    distance: t,
    colliderHandle: handle,
    isBot,
    botId: isBot ? botColliderMap.get(handle) : undefined,
  }
}
