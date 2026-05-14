import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'

/**
 * Match scoreboard, summoned by holding Tab while in an MP match.
 * Releasing Tab hides it. On Arena the table shows all 16 slots; on
 * Duel it's just the two players. Sorted by kills desc, ties broken
 * by fewer deaths.
 *
 * Rendered as a top-center overlay during mpPlaying / mpPaused /
 * mpDead. End-screen / lobby / SP — nothing.
 */
export function MpScoreboard() {
  const phase = useGameStore((s) => s.phase)
  const myKills = useGameStore((s) => s.kills)
  const myDeaths = useGameStore((s) => s.deaths)
  const myNickname = useNetStore((s) => s.nickname)
  const myId = useNetStore((s) => s.myId)
  const remotes = useNetStore((s) => s.remotePlayers)
  const rttMs = useNetStore((s) => s.rttMs)

  const [tabHeld, setTabHeld] = useState(false)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      // Tab in the browser tries to move focus through page chrome;
      // we want it as a pure game key while a match is up.
      e.preventDefault()
      if (!e.repeat) setTabHeld(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      e.preventDefault()
      setTabHeld(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    // Window losing focus while Tab is held would otherwise leave the
    // scoreboard stuck open — clear it on blur.
    const onBlur = () => setTabHeld(false)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const inMatch =
    phase === 'mpPlaying' || phase === 'mpPaused' || phase === 'mpDead'
  if (!inMatch) return null
  if (!tabHeld) return null
  if (!myId) return null

  const rows = [
    {
      id: myId,
      nickname: myNickname,
      kills: myKills,
      deaths: myDeaths,
      isBot: false,
      self: true,
      ping: rttMs ?? null,
    },
    ...Object.values(remotes).map((r) => ({
      id: r.id,
      nickname: r.nickname,
      kills: r.kills ?? 0,
      deaths: r.deaths ?? 0,
      isBot: r.isBot,
      self: false,
      ping: null as number | null,
    })),
  ].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)

  return (
    <div className="mp-scoreboard">
      <div className="mp-scoreboard-head">
        <span>PLAYER</span>
        <span>K</span>
        <span>D</span>
        <span>PING</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className={`mp-scoreboard-row ${r.self ? 'self' : ''} ${r.isBot ? 'bot' : ''}`}
        >
          <span className="mp-scoreboard-nick">
            {r.isBot ? `[BOT] ${r.nickname}` : r.nickname}
          </span>
          <span className="mp-scoreboard-num">{r.kills}</span>
          <span className="mp-scoreboard-num">{r.deaths}</span>
          <span className="mp-scoreboard-num">
            {r.ping != null ? r.ping : '—'}
          </span>
        </div>
      ))}
      <div className="hint" style={{ marginTop: 6 }}>
        HOLD TAB
      </div>
    </div>
  )
}
