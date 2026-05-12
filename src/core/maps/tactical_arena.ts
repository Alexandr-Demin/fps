import type { MapData } from '../mapTypes'

export const TACTICAL_ARENA: MapData = {
  name: 'TACTICAL-ARENA',
  entities: [
    // --- Floor ---
    {
      id: 'c_1',
      kind: 'concrete',
      pos: [0, -0.5, 0],
      size: [80, 1, 80],
      color: '#4a4e57',
    },

    // --- Perimeter walls ---
    {
      id: 'c_2',
      kind: 'concrete',
      pos: [0, 6, -40],
      size: [80, 12, 1],
      color: '#5c606b',
    },
    {
      id: 'c_3',
      kind: 'concrete',
      pos: [0, 6, 40],
      size: [80, 12, 1],
      color: '#5c606b',
    },
    {
      id: 'c_4',
      kind: 'concrete',
      pos: [-40, 6, 0],
      size: [1, 12, 80],
      color: '#5c606b',
    },
    {
      id: 'c_5',
      kind: 'concrete',
      pos: [40, 6, 0],
      size: [1, 12, 80],
      color: '#5c606b',
    },

    // --- Spawn sight blockers ---
    {
      id: 'c_6',
      kind: 'concrete',
      pos: [0, 3, -18],
      size: [12, 6, 2],
      color: '#6a6f7a',
    },
    {
      id: 'c_7',
      kind: 'concrete',
      pos: [0, 3, 18],
      size: [12, 6, 2],
      color: '#6a6f7a',
    },

    // --- Mid lane: structure ---
    {
      id: 'c_8',
      kind: 'concrete',
      pos: [-6, 3, 0],
      size: [1, 6, 48],
      color: '#565b66',
    },
    {
      id: 'c_9',
      kind: 'concrete',
      pos: [6, 3, 0],
      size: [1, 6, 48],
      color: '#565b66',
    },

    // Mid window / mid box
    {
      id: 'c_10',
      kind: 'concrete',
      pos: [0, 0.6, 0],
      size: [4, 1.2, 2],
      color: '#707887',
    },

    // Mid connector room
    {
      id: 'c_11',
      kind: 'concrete',
      pos: [0, 3, 12],
      size: [8, 6, 1],
      color: '#5f6570',
    },
    {
      id: 'c_12',
      kind: 'concrete',
      pos: [-4.5, 3, 16],
      size: [1, 6, 8],
      color: '#5f6570',
    },
    {
      id: 'c_13',
      kind: 'concrete',
      pos: [4.5, 3, 16],
      size: [1, 6, 8],
      color: '#5f6570',
    },

    // --- A long: structure + cover ---
    {
      id: 'c_14',
      kind: 'concrete',
      pos: [14, 3, -2],
      size: [1, 6, 60],
      color: '#5a5f69',
    },
    {
      id: 'c_15',
      kind: 'concrete',
      pos: [30, 3, -2],
      size: [1, 6, 60],
      color: '#5a5f69',
    },

    // A long half-cover
    {
      id: 'c_16',
      kind: 'concrete',
      pos: [22, 0.6, -18],
      size: [2, 1.2, 4],
      color: '#7c828e',
    },

    // A long full-cover
    {
      id: 'c_17',
      kind: 'concrete',
      pos: [20, 1.1, -2],
      size: [1.5, 2.2, 6],
      color: '#6f7683',
    },

    // A long boost-cover
    {
      id: 'c_18',
      kind: 'concrete',
      pos: [24, 0.8, 10],
      size: [2.5, 1.6, 2.5],
      color: '#7a808d',
    },

    // A choke entrance
    {
      id: 'c_19',
      kind: 'concrete',
      pos: [15.5, 3, 22],
      size: [3, 6, 1],
      color: '#5b606a',
    },
    {
      id: 'c_20',
      kind: 'concrete',
      pos: [28.5, 3, 22],
      size: [3, 6, 1],
      color: '#5b606a',
    },

    // --- Apps/B lane: structure + cover ---
    {
      id: 'c_21',
      kind: 'concrete',
      pos: [-14, 3, -2],
      size: [1, 6, 60],
      color: '#5a5f69',
    },
    {
      id: 'c_22',
      kind: 'concrete',
      pos: [-30, 3, -2],
      size: [1, 6, 60],
      color: '#5a5f69',
    },

    // B lane half-cover
    {
      id: 'c_23',
      kind: 'concrete',
      pos: [-22, 0.6, -14],
      size: [3, 1.2, 2],
      color: '#7d838f',
    },

    // B lane full-cover
    {
      id: 'c_24',
      kind: 'concrete',
      pos: [-20, 1.1, 2],
      size: [1.5, 2.2, 5],
      color: '#6f7683',
    },

    // B lane boost-cover
    {
      id: 'c_25',
      kind: 'concrete',
      pos: [-24, 0.8, 12],
      size: [2.5, 1.6, 2.5],
      color: '#7a808d',
    },

    // B choke entrance
    {
      id: 'c_26',
      kind: 'concrete',
      pos: [-28.5, 3, 22],
      size: [3, 6, 1],
      color: '#5b606a',
    },
    {
      id: 'c_27',
      kind: 'concrete',
      pos: [-15.5, 3, 22],
      size: [3, 6, 1],
      color: '#5b606a',
    },

    // --- A site: cover ---
    // Half-cover
    {
      id: 'c_28',
      kind: 'concrete',
      pos: [15, 0.6, 28],
      size: [3, 1.2, 2],
      color: '#7d848f',
    },
    {
      id: 'c_29',
      kind: 'concrete',
      pos: [23, 0.6, 24],
      size: [4, 1.2, 2],
      color: '#7d848f',
    },

    // Full-cover
    {
      id: 'c_30',
      kind: 'concrete',
      pos: [18, 1.1, 18],
      size: [2, 2.2, 6],
      color: '#6d7480',
    },
    {
      id: 'c_31',
      kind: 'concrete',
      pos: [27, 1.1, 30],
      size: [1.5, 2.2, 5],
      color: '#6d7480',
    },

    // Boost-cover
    {
      id: 'c_32',
      kind: 'concrete',
      pos: [12, 0.8, 20],
      size: [2.5, 1.6, 2.5],
      color: '#808692',
    },
    {
      id: 'c_33',
      kind: 'concrete',
      pos: [24, 0.8, 34],
      size: [2.5, 1.6, 2.5],
      color: '#808692',
    },

    // --- B site: cover ---
    // Half-cover
    {
      id: 'c_34',
      kind: 'concrete',
      pos: [-16, 0.6, 26],
      size: [4, 1.2, 2],
      color: '#7d848f',
    },
    {
      id: 'c_35',
      kind: 'concrete',
      pos: [-24, 0.6, 32],
      size: [3, 1.2, 2],
      color: '#7d848f',
    },

    // Full-cover
    {
      id: 'c_36',
      kind: 'concrete',
      pos: [-20, 1.1, 18],
      size: [2, 2.2, 6],
      color: '#6d7480',
    },
    {
      id: 'c_37',
      kind: 'concrete',
      pos: [-28, 1.1, 28],
      size: [1.5, 2.2, 5],
      color: '#6d7480',
    },

    // Boost-cover
    {
      id: 'c_38',
      kind: 'concrete',
      pos: [-12, 0.8, 20],
      size: [2.5, 1.6, 2.5],
      color: '#808692',
    },
    {
      id: 'c_39',
      kind: 'concrete',
      pos: [-24, 0.8, 14],
      size: [2.5, 1.6, 2.5],
      color: '#808692',
    },

    // --- Catwalk + stairs ---
    {
      id: 'c_40',
      kind: 'concrete',
      pos: [-10, 3.75, 6],
      size: [12, 0.5, 3],
      color: '#727988',
    },

    // Railings
    {
      id: 'c_41',
      kind: 'concrete',
      pos: [-10, 4.35, 4.6],
      size: [12, 0.7, 0.2],
      color: '#8b92a0',
    },
    {
      id: 'c_42',
      kind: 'concrete',
      pos: [-10, 4.35, 7.4],
      size: [12, 0.7, 0.2],
      color: '#8b92a0',
    },

    // Stairs
    {
      id: 'c_43',
      kind: 'concrete',
      pos: [-16, 0.2, 6],
      size: [3, 0.4, 2],
      color: '#737a88',
    },
    {
      id: 'c_44',
      kind: 'concrete',
      pos: [-14.5, 0.8, 6],
      size: [3, 0.4, 2],
      color: '#737a88',
    },
    {
      id: 'c_45',
      kind: 'concrete',
      pos: [-13, 1.4, 6],
      size: [3, 0.4, 2],
      color: '#737a88',
    },
    {
      id: 'c_46',
      kind: 'concrete',
      pos: [-11.5, 2.0, 6],
      size: [3, 0.4, 2],
      color: '#737a88',
    },
    {
      id: 'c_47',
      kind: 'concrete',
      pos: [-10, 2.6, 6],
      size: [3, 0.4, 2],
      color: '#737a88',
    },
    {
      id: 'c_48',
      kind: 'concrete',
      pos: [-8.5, 3.2, 6],
      size: [3, 0.4, 2],
      color: '#737a88',
    },

    // --- Sightline-breaker walls ---
    {
      id: 'c_49',
      kind: 'concrete',
      pos: [0, 3, -8],
      size: [0.5, 6, 4],
      color: '#666d78',
    },
    {
      id: 'c_50',
      kind: 'concrete',
      pos: [22, 3, 6],
      size: [0.5, 6, 4],
      color: '#666d78',
    },
    {
      id: 'c_51',
      kind: 'concrete',
      pos: [-22, 3, 8],
      size: [0.5, 6, 4],
      color: '#666d78',
    },

    // --- Light fixtures (metal) ---
    {
      id: 'm_1',
      kind: 'metal',
      pos: [12, 10.5, 18],
      size: [2, 0.5, 2],
      color: '#8894aa',
      emissive: '#a8c4ff',
      emissiveIntensity: 4,
    },
    {
      id: 'm_2',
      kind: 'metal',
      pos: [28, 10.5, 34],
      size: [2, 0.5, 2],
      color: '#8894aa',
      emissive: '#a8c4ff',
      emissiveIntensity: 4,
    },
    {
      id: 'm_3',
      kind: 'metal',
      pos: [-12, 10.5, 18],
      size: [2, 0.5, 2],
      color: '#8894aa',
      emissive: '#a8c4ff',
      emissiveIntensity: 4,
    },
    {
      id: 'm_4',
      kind: 'metal',
      pos: [-28, 10.5, 34],
      size: [2, 0.5, 2],
      color: '#8894aa',
      emissive: '#a8c4ff',
      emissiveIntensity: 4,
    },

    // Mid accent
    {
      id: 'm_5',
      kind: 'metal',
      pos: [0, 4, 0],
      size: [1, 8, 1],
      color: '#99958a',
      emissive: '#ffd066',
      emissiveIntensity: 2.5,
    },

    // Spawn warning strips
    {
      id: 'm_6',
      kind: 'metal',
      pos: [0, 0.1, -30],
      size: [8, 0.05, 0.05],
      color: '#aa6644',
      emissive: '#ff5028',
      emissiveIntensity: 2,
    },
    {
      id: 'm_7',
      kind: 'metal',
      pos: [0, 0.1, 30],
      size: [8, 0.05, 0.05],
      color: '#6688aa',
      emissive: '#58a6ff',
      emissiveIntensity: 2,
    },

    // --- T spawns ---
    {
      id: 'ps_1',
      kind: 'playerSpawn',
      pos: [0, 2.5, -30],
    },

    // --- CT spawns ---
    {
      id: 'bs_1',
      kind: 'botSpawn',
      pos: [-12, 2.5, -28],
    },
    {
      id: 'bs_2',
      kind: 'botSpawn',
      pos: [12, 2.5, -28],
    },
    {
      id: 'bs_3',
      kind: 'botSpawn',
      pos: [-22, 2.5, -10],
    },
    {
      id: 'bs_4',
      kind: 'botSpawn',
      pos: [22, 2.5, -10],
    },
    {
      id: 'bs_5',
      kind: 'botSpawn',
      pos: [-22, 2.5, 28],
    },
    {
      id: 'bs_6',
      kind: 'botSpawn',
      pos: [22, 2.5, 28],
    },

    // --- Waypoints ---
    // T spawn
    {
      id: 'wp_1',
      kind: 'waypoint',
      pos: [0, 1, -30],
    },

    // Mid lane
    {
      id: 'wp_2',
      kind: 'waypoint',
      pos: [0, 1, -16],
    },
    {
      id: 'wp_3',
      kind: 'waypoint',
      pos: [0, 1, 0],
    },
    {
      id: 'wp_4',
      kind: 'waypoint',
      pos: [0, 1, 14],
    },

    // A long
    {
      id: 'wp_5',
      kind: 'waypoint',
      pos: [22, 1, -18],
    },
    {
      id: 'wp_6',
      kind: 'waypoint',
      pos: [22, 1, 0],
    },
    {
      id: 'wp_7',
      kind: 'waypoint',
      pos: [22, 1, 18],
    },

    // B/apps lane
    {
      id: 'wp_8',
      kind: 'waypoint',
      pos: [-22, 1, -16],
    },
    {
      id: 'wp_9',
      kind: 'waypoint',
      pos: [-22, 1, 2],
    },
    {
      id: 'wp_10',
      kind: 'waypoint',
      pos: [-22, 1, 18],
    },

    // A site
    {
      id: 'wp_11',
      kind: 'waypoint',
      pos: [16, 1, 28],
    },
    {
      id: 'wp_12',
      kind: 'waypoint',
      pos: [26, 1, 30],
    },

    // B site
    {
      id: 'wp_13',
      kind: 'waypoint',
      pos: [-16, 1, 28],
    },
    {
      id: 'wp_14',
      kind: 'waypoint',
      pos: [-28, 1, 28],
    },

    // Mid connector
    {
      id: 'wp_15',
      kind: 'waypoint',
      pos: [0, 1, 18],
    },

    // Catwalk
    {
      id: 'wp_16',
      kind: 'waypoint',
      pos: [-10, 4.2, 6],
    },

    // Catwalk stairs
    {
      id: 'wp_17',
      kind: 'waypoint',
      pos: [-15, 1, 6],
    },

    // CT side
    {
      id: 'wp_18',
      kind: 'waypoint',
      pos: [0, 1, 30],
    },
  ],

  fog: {
    near: 35,
    far: 160,
    color: '#1c2230',
  },
}
