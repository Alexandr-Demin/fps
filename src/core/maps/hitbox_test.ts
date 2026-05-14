import type { MapData } from '../mapTypes'

/**
 * HITBOX-TEST — practice range with three static dummies in standing,
 * crouching, and sliding pose. Use it to verify that headshot, torso,
 * and leg zones land where the visual silhouette suggests across the
 * three states. No bots, no waypoints — just a flat floor, lighting,
 * and a row of targets.
 */
export const HITBOX_TEST: MapData = {
  name: 'HITBOX-TEST',
  entities: [
    // Flat floor
    { id: 'c_floor', kind: 'concrete', pos: [0, -0.5, 0], size: [30, 1, 30], color: '#4a4e57' },

    // Perimeter low walls so you can't strafe off the test pad
    { id: 'c_wn', kind: 'concrete', pos: [0, 1, 15], size: [30, 2, 1], color: '#5c606b' },
    { id: 'c_ws', kind: 'concrete', pos: [0, 1, -15], size: [30, 2, 1], color: '#5c606b' },
    { id: 'c_we', kind: 'concrete', pos: [15, 1, 0], size: [1, 2, 30], color: '#5c606b' },
    { id: 'c_ww', kind: 'concrete', pos: [-15, 1, 0], size: [1, 2, 30], color: '#5c606b' },

    // Lighting — soft cool ceiling lamps
    { id: 'm_l1', kind: 'metal', pos: [-6, 8, 0], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#a8c4ff', emissiveIntensity: 4 },
    { id: 'm_l2', kind: 'metal', pos: [ 6, 8, 0], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#a8c4ff', emissiveIntensity: 4 },
    { id: 'm_l3', kind: 'metal', pos: [ 0, 8, 6], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#ffd8a0', emissiveIntensity: 4 },

    // Player spawn — facing the dummies (north). Capsule center y = 0.9
    // matches a freshly-spawned PlayerController body center.
    { id: 's_main', kind: 'playerSpawn', pos: [0, 0.9, -8] },

    // Dummies — three states in a row at z=+6, ~3m apart on X.
    // Capsule center.y = 0.9 (same as live players).
    {
      id: 'd_standing',
      kind: 'targetDummy',
      pos: [-4, 0.9, 6],
      state: 'standing',
      yaw: Math.PI, // face the shooter (north → south)
      label: 'STANDING',
    },
    {
      id: 'd_crouching',
      kind: 'targetDummy',
      pos: [0, 0.9, 6],
      state: 'crouching',
      yaw: Math.PI,
      label: 'CROUCHING',
    },
    {
      id: 'd_sliding',
      kind: 'targetDummy',
      pos: [4, 0.9, 6],
      state: 'sliding',
      yaw: Math.PI,
      label: 'SLIDING',
    },
  ],
  fog: { near: 60, far: 200, color: '#1c2230' },
}
