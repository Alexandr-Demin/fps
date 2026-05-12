import type { MapData } from '../mapTypes'

let s = 0
const id = (k: string) => `tpl_${k}_${++s}`

// Bare-bones template: 80x80 concrete slab, one player spawn at origin,
// a few starter bot spawns spread around so the user can immediately test
// gameplay without setting them up from scratch.
export const EMPTY_TEMPLATE: MapData = {
  name: 'NEW MAP',
  entities: [
    { id: id('c'), kind: 'concrete', pos: [0, -0.5, 0], size: [80, 1, 80] },
    { id: id('ps'), kind: 'playerSpawn', pos: [0, 2.5, 0] },
    { id: id('bs'), kind: 'botSpawn', pos: [20, 2.5, 0] },
    { id: id('bs'), kind: 'botSpawn', pos: [-20, 2.5, 0] },
    { id: id('bs'), kind: 'botSpawn', pos: [0, 2.5, 20] },
    { id: id('bs'), kind: 'botSpawn', pos: [0, 2.5, -20] },
    { id: id('wp'), kind: 'waypoint', pos: [0, 1.5, 0] },
  ],
  fog: { near: 40, far: 180, color: '#1c2230' },
}
