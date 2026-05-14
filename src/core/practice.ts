import type { MapData } from './mapTypes'
import { HITBOX_TEST } from './maps/hitbox_test'

// Registry of practice / test maps surfaced on the Practice screen.
// Separate from LEVELS so the main "DEPLOY · SOLO" list isn't polluted
// with dev fixtures, and so we can grow this independently as new
// experiments land (recoil practice, movement parkour, bot AI sandbox,
// etc.).

export interface PracticeEntry {
  id: string
  map: MapData
  title: string
  tagline: string
}

export const PRACTICE_MAPS: PracticeEntry[] = [
  {
    id: 'hitbox_test',
    map: HITBOX_TEST,
    title: 'HITBOX TEST',
    tagline: 'Three static dummies — standing / crouching / sliding',
  },
]
