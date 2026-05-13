// Build the static-collider Rapier world from a MapData payload — used
// identically by the client (in PlayerController via @react-three/rapier
// integration) and the server (per-room standalone world).

import type RAPIER from '@dimforge/rapier3d-compat'
import type { MapData } from '../protocol.js'

/**
 * Populate `world` with cuboid colliders for every concrete/metal box in
 * the map. Player-spawn / waypoint markers are data-only, not colliders.
 * The world is expected to already have gravity configured by the caller.
 */
export function populateMapColliders(
  rapier: typeof RAPIER,
  world: RAPIER.World,
  map: MapData,
) {
  for (const e of map.entities) {
    if (e.kind !== 'concrete' && e.kind !== 'metal') continue
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(e.pos[0], e.pos[1], e.pos[2]),
    )
    world.createCollider(
      rapier.ColliderDesc.cuboid(e.size[0] / 2, e.size[1] / 2, e.size[2] / 2),
      body,
    )
  }
}
