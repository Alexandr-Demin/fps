import type { GameMode } from '../../shared/src/protocol.js'

// Per-mode room tunings. Read by Lobby at createRoom-time; Room receives
// the resolved numbers in its constructor so it doesn't need mode-awareness
// for runtime decisions (cap, respawn cadence, etc.).
//
// IMPORTANT: respawn / match-duration values are listed here but only
// `maxPlayers` is wired through at step 4.3. Step 4.5 hooks respawn into
// Room.onHit; step 4.4 hooks matchDurationMs into the match timer. Leaving
// the values in place now so the table is the single source of truth as
// the rest of phase 4 lands.

export interface ModeConfig {
  maxPlayers: number
  respawnMs: number
  matchDurationMs: number | null // null = no timer (duel)
}

export const MODE_CONFIG: Record<GameMode, ModeConfig> = {
  duel: {
    maxPlayers: 2,
    respawnMs: 4500,
    matchDurationMs: null,
  },
  arena: {
    maxPlayers: 16,
    respawnMs: 300,
    matchDurationMs: 5 * 60 * 1000,
  },
}
