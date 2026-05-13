import type { MapData } from '../mapTypes'

/**
 * AIM-DUEL — small symmetric 1v1 arena, ~24×30m. Designed for quick
 * deathmatch duels: 4 player spawns in opposite corners, two central
 * pillars breaking direct cross-room sightlines, low cover for peek
 * fights. Also playable in SP (a few bot spawns + waypoints included).
 */
export const AIM_DUEL: MapData = {
  name: 'AIM-DUEL',
  entities: [
    // --- Floor ---
    { id: 'c_floor', kind: 'concrete', pos: [0, -0.5, 0], size: [24, 1, 30], color: '#4a4e57' },

    // --- Perimeter walls ---
    { id: 'c_wn', kind: 'concrete', pos: [0, 5, 15], size: [24, 10, 1], color: '#5c606b' },
    { id: 'c_ws', kind: 'concrete', pos: [0, 5, -15], size: [24, 10, 1], color: '#5c606b' },
    { id: 'c_we', kind: 'concrete', pos: [12, 5, 0], size: [1, 10, 30], color: '#5c606b' },
    { id: 'c_ww', kind: 'concrete', pos: [-12, 5, 0], size: [1, 10, 30], color: '#5c606b' },

    // --- Central pillars (break direct N↔S sightline through mid) ---
    { id: 'c_p1', kind: 'concrete', pos: [-3.5, 2.5, 0], size: [1.5, 5, 1.5], color: '#6a6f7a' },
    { id: 'c_p2', kind: 'concrete', pos: [3.5, 2.5, 0], size: [1.5, 5, 1.5], color: '#6a6f7a' },

    // --- Corner cover boxes (boost-cover, 1.6m: can jump on, peek over) ---
    { id: 'c_b1', kind: 'concrete', pos: [-7, 0.8, 6], size: [2, 1.6, 2], color: '#7a808d' },
    { id: 'c_b2', kind: 'concrete', pos: [7, 0.8, 6], size: [2, 1.6, 2], color: '#7a808d' },
    { id: 'c_b3', kind: 'concrete', pos: [-7, 0.8, -6], size: [2, 1.6, 2], color: '#7a808d' },
    { id: 'c_b4', kind: 'concrete', pos: [7, 0.8, -6], size: [2, 1.6, 2], color: '#7a808d' },

    // --- Mid low-cover (half-cover, 1.2m: peek-over duels in center) ---
    { id: 'c_lc1', kind: 'concrete', pos: [0, 0.6, 5], size: [4, 1.2, 1.2], color: '#7d848f' },
    { id: 'c_lc2', kind: 'concrete', pos: [0, 0.6, -5], size: [4, 1.2, 1.2], color: '#7d848f' },

    // --- Sightline-breaker walls on the lateral lanes ---
    { id: 'c_lb1', kind: 'concrete', pos: [-10, 2, 0], size: [0.5, 4, 3], color: '#666d78' },
    { id: 'c_lb2', kind: 'concrete', pos: [10, 2, 0], size: [0.5, 4, 3], color: '#666d78' },

    // --- Ceiling lamps (4 cool + 1 warm central accent) ---
    { id: 'm_l1', kind: 'metal', pos: [-6, 8.5, 8], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#a8c4ff', emissiveIntensity: 4 },
    { id: 'm_l2', kind: 'metal', pos: [6, 8.5, 8], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#a8c4ff', emissiveIntensity: 4 },
    { id: 'm_l3', kind: 'metal', pos: [-6, 8.5, -8], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#a8c4ff', emissiveIntensity: 4 },
    { id: 'm_l4', kind: 'metal', pos: [6, 8.5, -8], size: [1.5, 0.3, 1.5], color: '#8894aa', emissive: '#a8c4ff', emissiveIntensity: 4 },
    { id: 'm_lc', kind: 'metal', pos: [0, 9, 0], size: [2, 0.3, 2], color: '#99958a', emissive: '#ffd066', emissiveIntensity: 3 },

    // --- Spawn-line warning strips (colored ends) ---
    { id: 'm_strN', kind: 'metal', pos: [0, 0.05, 12], size: [10, 0.05, 0.05], color: '#6688aa', emissive: '#58a6ff', emissiveIntensity: 2 },
    { id: 'm_strS', kind: 'metal', pos: [0, 0.05, -12], size: [10, 0.05, 0.05], color: '#aa6644', emissive: '#ff5028', emissiveIntensity: 2 },

    // --- Player spawns (4 corners, server picks randomly on respawn) ---
    { id: 'ps_NE', kind: 'playerSpawn', pos: [9, 2.5, 12] },
    { id: 'ps_NW', kind: 'playerSpawn', pos: [-9, 2.5, 12] },
    { id: 'ps_SE', kind: 'playerSpawn', pos: [9, 2.5, -12] },
    { id: 'ps_SW', kind: 'playerSpawn', pos: [-9, 2.5, -12] },

    // --- Bot spawns (SP playability — MP ignores these) ---
    { id: 'bs_1', kind: 'botSpawn', pos: [0, 2.5, 12] },
    { id: 'bs_2', kind: 'botSpawn', pos: [0, 2.5, -12] },
    { id: 'bs_3', kind: 'botSpawn', pos: [-9, 2.5, 0] },
    { id: 'bs_4', kind: 'botSpawn', pos: [9, 2.5, 0] },

    // --- Waypoints (SP bot AI navigation) ---
    { id: 'wp_n',  kind: 'waypoint', pos: [0, 1, 11] },
    { id: 'wp_s',  kind: 'waypoint', pos: [0, 1, -11] },
    { id: 'wp_e',  kind: 'waypoint', pos: [9, 1, 0] },
    { id: 'wp_w',  kind: 'waypoint', pos: [-9, 1, 0] },
    { id: 'wp_ne', kind: 'waypoint', pos: [7, 1, 8] },
    { id: 'wp_nw', kind: 'waypoint', pos: [-7, 1, 8] },
    { id: 'wp_se', kind: 'waypoint', pos: [7, 1, -8] },
    { id: 'wp_sw', kind: 'waypoint', pos: [-7, 1, -8] },
    { id: 'wp_c',  kind: 'waypoint', pos: [0, 1, 0] },
  ],

  fog: { near: 20, far: 60, color: '#1c2230' },
}
