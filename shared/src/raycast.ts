import type { MapData, Vec3 } from './protocol.js'

// Server-side line-of-sight check. Bots use this to decide whether a
// human target is actually visible before pulling the trigger — we
// don't run Rapier on the server (per the phase-4 decision), so this
// is a pure-math AABB-vs-segment test against every concrete / metal
// entity in the map.
//
// Slab method, branchless on the dimension count (3). Returns true if
// the segment from `from` to `to` intersects any box. The caller
// reads it as "is the shot blocked?".

interface BoxLike {
  pos: Vec3
  size: Vec3
}

function intersectsAabb(from: Vec3, to: Vec3, box: BoxLike): boolean {
  const min: Vec3 = [
    box.pos[0] - box.size[0] / 2,
    box.pos[1] - box.size[1] / 2,
    box.pos[2] - box.size[2] / 2,
  ]
  const max: Vec3 = [
    box.pos[0] + box.size[0] / 2,
    box.pos[1] + box.size[1] / 2,
    box.pos[2] + box.size[2] / 2,
  ]

  let tmin = 0
  let tmax = 1
  for (let i = 0; i < 3; i++) {
    const dir = to[i] - from[i]
    if (Math.abs(dir) < 1e-9) {
      // Segment parallel to this slab — outside means no intersection.
      if (from[i] < min[i] || from[i] > max[i]) return false
    } else {
      const inv = 1 / dir
      let t1 = (min[i] - from[i]) * inv
      let t2 = (max[i] - from[i]) * inv
      if (t1 > t2) {
        const swap = t1
        t1 = t2
        t2 = swap
      }
      if (t1 > tmin) tmin = t1
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) return false
    }
  }
  return true
}

/**
 * True if the line segment from `from` to `to` is blocked by any
 * solid map geometry. Concrete and metal entities are considered
 * solid; playerSpawn / waypoint / targetDummy are ignored.
 */
export function raycastAgainstMap(
  map: MapData,
  from: Vec3,
  to: Vec3,
): { blocked: boolean } {
  for (const e of map.entities) {
    if (e.kind !== 'concrete' && e.kind !== 'metal') continue
    const box = e as unknown as BoxLike
    if (intersectsAabb(from, to, box)) return { blocked: true }
  }
  return { blocked: false }
}
