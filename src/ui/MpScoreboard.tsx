import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'

/**
 * Live scoreboard for ARENA DUEL matches. Aggregates the local player's
 * stats from gameStore (kills/deaths/nickname) with remote players from
 * netStore.remotePlayers, then sorts by kills desc / deaths asc.
 *
 * Rendered as a top-right overlay during mpPlaying, mpPaused and mpDead
 * so the player can always see the standings, including while waiting
 * to respawn.
 */
export function MpScoreboard() {
  const phase = useGameStore((s) => s.phase)
  const myKills = useGameStore((s) => s.kills)
  const myDeaths = useGameStore((s) => s.deaths)
  const myNickname = useNetStore((s) => s.nickname)
  const myId = useNetStore((s) => s.myId)
  const remotes = useNetStore((s) => s.remotePlayers)

  if (phase !== 'mpPlaying' && phase !== 'mpPaused' && phase !== 'mpDead') {
    return null
  }
  if (!myId) return null

  const rows = [
    { id: myId, nickname: myNickname, kills: myKills, deaths: myDeaths, self: true },
    ...Object.values(remotes).map((r) => ({
      id: r.id,
      nickname: r.nickname,
      kills: r.kills ?? 0,
      deaths: r.deaths ?? 0,
      self: false,
    })),
  ].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)

  return (
    <div className="mp-scoreboard">
      <div className="mp-scoreboard-head">
        <span>PLAYER</span>
        <span>K</span>
        <span>D</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className={`mp-scoreboard-row ${r.self ? 'self' : ''}`}
        >
          <span className="mp-scoreboard-nick">{r.nickname}</span>
          <span className="mp-scoreboard-num">{r.kills}</span>
          <span className="mp-scoreboard-num">{r.deaths}</span>
        </div>
      ))}
    </div>
  )
}
