import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'
import { NetClient } from '../systems/net/NetClient'

/**
 * Full-screen overlay shown when an arena match clock runs out.
 * The server flips room phase to 'ended', broadcasts a top-5
 * leaderboard, and evicts the room ~10 seconds later — we display
 * the leaderboard for that window and offer a BACK TO LOBBY button
 * for anyone who doesn't want to wait.
 *
 * Skipped silently for duel matches (they have no timer and never
 * report phase === 'ended').
 */
export function MpEndScreen() {
  const gamePhase = useGameStore((s) => s.phase)
  const roomPhase = useNetStore((s) => s.currentRoomPhase)
  const results = useNetStore((s) => s.currentMatchResults)
  const myId = useNetStore((s) => s.myId)

  const isMp =
    gamePhase === 'mpPlaying' ||
    gamePhase === 'mpDead' ||
    gamePhase === 'mpPaused'
  if (!isMp) return null
  if (roomPhase !== 'ended') return null
  if (!results) return null

  const onLeave = () => {
    NetClient.leaveRoom()
  }

  // Winner is the first row (sorted by kills desc / deaths asc on the
  // server). The "you" highlight calls out the local player even when
  // they didn't make the podium.
  return (
    <div className="overlay interactive end-screen">
      <div className="end-screen-card">
        <div className="sub">ARENA</div>
        <h1>MATCH OVER</h1>
        <div className="sub">TOP 5</div>

        <div className="end-screen-rows">
          {results.length === 0 ? (
            <div className="hint">No one scored.</div>
          ) : (
            results.map((r, i) => {
              const winner = i === 0
              const isMe = r.id === myId
              return (
                <div
                  key={r.id}
                  className={`end-screen-row${winner ? ' winner' : ''}${isMe ? ' me' : ''}`}
                >
                  <span className="end-screen-rank">#{i + 1}</span>
                  <span className="end-screen-name">{r.nickname}</span>
                  <span className="end-screen-kd">
                    <span className="kills">{r.kills}</span>
                    <span className="sep"> · </span>
                    <span className="deaths">{r.deaths}</span>
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div className="hint" style={{ marginTop: 12 }}>
          Returning to lobby in a few seconds…
        </div>

        <div className="menu-buttons" style={{ marginTop: 14 }}>
          <button onClick={onLeave}>BACK TO LOBBY</button>
        </div>
      </div>
    </div>
  )
}
