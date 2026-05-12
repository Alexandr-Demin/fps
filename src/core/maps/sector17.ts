import type { MapData, MapEntity, Vec3Tuple } from '../mapTypes'

// === Helpers to keep the data block readable ============================
let counter = 0
const id = (k: string) => `s17_${k}_${++counter}`

const concrete = (pos: Vec3Tuple, size: Vec3Tuple): MapEntity => ({
  id: id('c'),
  kind: 'concrete',
  pos,
  size,
})

const metal = (
  pos: Vec3Tuple,
  size: Vec3Tuple,
  emissive?: string,
  emissiveIntensity?: number
): MapEntity => ({
  id: id('m'),
  kind: 'metal',
  pos,
  size,
  emissive,
  emissiveIntensity,
})

const pSpawn = (pos: Vec3Tuple): MapEntity => ({
  id: id('ps'),
  kind: 'playerSpawn',
  pos,
})
const bSpawn = (pos: Vec3Tuple): MapEntity => ({
  id: id('bs'),
  kind: 'botSpawn',
  pos,
})
const wp = (pos: Vec3Tuple): MapEntity => ({
  id: id('wp'),
  kind: 'waypoint',
  pos,
})

// === SECTOR-17 layout ===================================================
export const SECTOR_17: MapData = {
  name: 'SECTOR-17',
  entities: [
    // --- Floor + ceiling ---
    concrete([0, -0.5, 0], [80, 1, 80]),
    concrete([0, 22, 0], [80, 1, 80]),

    // --- Outer perimeter walls ---
    concrete([0, 11, -40], [80, 22, 1]),
    concrete([0, 11, 40], [80, 22, 1]),
    concrete([-40, 11, 0], [1, 22, 80]),
    concrete([40, 11, 0], [1, 22, 80]),

    // --- Inner pillars ---
    concrete([-14, 11, -14], [3, 22, 3]),
    concrete([14, 11, -14], [3, 22, 3]),
    concrete([-14, 11, 14], [3, 22, 3]),
    concrete([14, 11, 14], [3, 22, 3]),
    concrete([-26, 11, 0], [3, 22, 3]),
    concrete([26, 11, 0], [3, 22, 3]),
    concrete([0, 11, -26], [3, 22, 3]),
    concrete([0, 11, 26], [3, 22, 3]),

    // --- Reactor core (stacked) ---
    concrete([0, 1.5, 0], [4, 3, 4]),
    concrete([0, 5, 0], [3.5, 4, 3.5]),
    concrete([0, 9, 0], [3, 4, 3]),

    // --- Cover blocks ---
    concrete([10, 1, 4], [2, 2, 2]),
    concrete([-9, 1, 8], [2.5, 2, 2.5]),
    concrete([6, 1, -10], [2, 2, 4]),
    concrete([-12, 1, -6], [3, 2, 2]),
    concrete([16, 1, 16], [2.5, 2, 2.5]),
    concrete([-16, 1, -16], [2.5, 2, 2.5]),
    concrete([20, 1, -4], [2, 2, 3]),
    concrete([-20, 1, 6], [3, 2, 2]),
    concrete([4, 1, 20], [2, 2, 2]),

    // --- Upper walkways ---
    concrete([-22, 7, -8], [28, 0.5, 4]),
    concrete([-10, 7, -22], [4, 0.5, 28]),
    concrete([22, 7, 8], [28, 0.5, 4]),
    concrete([10, 7, 22], [4, 0.5, 28]),

    // --- Walkway railings ---
    concrete([-22, 7.6, -10], [28, 0.7, 0.2]),
    concrete([-22, 7.6, -6], [28, 0.7, 0.2]),
    concrete([22, 7.6, 10], [28, 0.7, 0.2]),
    concrete([22, 7.6, 6], [28, 0.7, 0.2]),

    // --- West ramp ---
    concrete([-36, 3.5, -8], [8, 0.4, 3]),
    concrete([-36, 5.5, -8], [8, 0.4, 3]),
    concrete([-36, 7, -8], [8, 0.4, 3]),

    // --- East stairs ---
    concrete([36, 1.5, 8], [4, 0.4, 3]),
    concrete([33, 2.6, 8], [4, 0.4, 3]),
    concrete([30, 3.7, 8], [4, 0.4, 3]),
    concrete([27, 4.8, 8], [4, 0.4, 3]),
    concrete([24, 5.9, 8], [4, 0.4, 3]),
    concrete([21, 7, 8], [4, 0.4, 3]),

    // --- Wall fragments breaking center sightlines ---
    concrete([-8, 3, 0], [0.6, 6, 6]),
    concrete([8, 3, 0], [0.6, 6, 6]),
    concrete([0, 3, -8], [6, 6, 0.6]),
    concrete([0, 3, 8], [6, 6, 0.6]),

    // --- Metal: reactor band ---
    metal([0, 11.5, 0], [3.2, 0.4, 3.2], '#ff5b2a', 2.2),
    // --- Metal: ceiling lamps ---
    metal([-10, 18, -10], [2, 0.3, 2], '#a8c4ff', 4.5),
    metal([10, 18, -10], [2, 0.3, 2], '#a8c4ff', 4.5),
    metal([-10, 18, 10], [2, 0.3, 2], '#a8c4ff', 4.5),
    metal([10, 18, 10], [2, 0.3, 2], '#a8c4ff', 4.5),
    metal([0, 19, 0], [3, 0.4, 3], '#a8c4ff', 3.5),
    // --- Metal: warning strips on walkways ---
    metal([-22, 7.3, -8.05], [28, 0.05, 0.05], '#ff5028', 2.0),
    metal([22, 7.3, 8.05], [28, 0.05, 0.05], '#ff5028', 2.0),

    // --- Player spawns ---
    pSpawn([0, 2.5, 0]),
    pSpawn([22, 2.5, 18]),
    pSpawn([-26, 2.5, -10]),
    pSpawn([18, 8.5, -22]),
    pSpawn([-18, 2.5, 22]),

    // --- Bot spawns ---
    bSpawn([22, 2.5, 22]),
    bSpawn([-26, 2.5, 18]),
    bSpawn([26, 2.5, -22]),
    bSpawn([-22, 2.5, -26]),
    bSpawn([0, 2.5, 28]),
    bSpawn([0, 2.5, -28]),
    bSpawn([18, 8.5, -18]),
    bSpawn([-18, 8.5, 18]),

    // --- Waypoints ---
    wp([0, 1.5, 0]),
    wp([14, 1.5, 8]),
    wp([22, 1.5, -6]),
    wp([-16, 1.5, -14]),
    wp([-22, 1.5, 12]),
    wp([8, 1.5, 22]),
    wp([-8, 1.5, 26]),
    wp([26, 1.5, 24]),
    wp([-26, 1.5, -22]),
    wp([18, 7.5, -18]),
    wp([-18, 7.5, 18]),
    wp([0, 1.5, -28]),
    wp([0, 1.5, 28]),
  ],
  fog: { near: 40, far: 180, color: '#1c2230' },
}
