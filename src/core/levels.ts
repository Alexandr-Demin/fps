import type { MapData } from './mapTypes'
import { SECTOR_17 } from './maps/sector17'
import { TACTICAL_ARENA } from './maps/tactical_arena'
import { AIM_DUEL } from './maps/aim_duel'

// Registry of single-player maps shown on the level-select screen.
// Add a new entry here to surface a new map; index order = card order.

export interface LevelEntry {
  id: string
  map: MapData
  tagline: string
  // Marks a card that should be visible but not selectable yet.
  comingSoon?: boolean
}

export const LEVELS: LevelEntry[] = [
  {
    id: 'sector17',
    map: SECTOR_17,
    tagline: 'Industrial reactor · multi-tier vertical play',
  },
  {
    id: 'tactical_arena',
    map: TACTICAL_ARENA,
    tagline: 'Tactical CS-style arena · mid + A long + apps',
  },
  {
    id: 'aim_duel',
    map: AIM_DUEL,
    tagline: '1v1 mini-arena · fast duels, symmetric corners',
  },
]

export const COMING_SOON_SLOTS = 0

export function findLevel(id: string): LevelEntry | undefined {
  return LEVELS.find((l) => l.id === id)
}
