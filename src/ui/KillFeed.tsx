import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'
import type { PlayerId } from '@shared/protocol'

// How long each entry stays visible before fading out, plus the short
// fade window inside that. Picked so a flurry of kills stays readable
// while not lingering forever.
const ROW_HOLD_S = 4
const ROW_FADE_S = 0.6

interface ResolvedName {
  name: string
  isBot: boolean
  self: boolean
}

/**
 * Top-right kill feed. One row per recent kill, newest at the top.
 * Names resolve at render-time off the current snapshot so a player
 * who left the room mid-feed gracefully degrades to "?" rather than
 * showing a stale nickname. Bot kills (as attacker or victim) are
 * tagged with a [BOT] prefix.
 */
export function KillFeed() {
  const phase = useGameStore((s) => s.phase)
  const feed = useNetStore((s) => s.killFeed)
  const myId = useNetStore((s) => s.myId)
  const myNickname = useNetStore((s) => s.nickname)
  const remotes = useNetStore((s) => s.remotePlayers)

  // raf clock so the rows fade smoothly without forcing the store to
  // re-emit on every frame.
  const [now, setNow] = useState(performance.now() / 1000)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setNow(performance.now() / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (phase !== 'mpPlaying' && phase !== 'mpPaused' && phase !== 'mpDead') {
    return null
  }
  if (feed.length === 0) return null

  function resolve(id: PlayerId): ResolvedName {
    if (id === myId) {
      return { name: myNickname || 'YOU', isBot: false, self: true }
    }
    const r = remotes[id]
    if (r) return { name: r.nickname, isBot: r.isBot, self: false }
    return { name: '?', isBot: false, self: false }
  }

  return (
    <div className="kill-feed">
      {feed.map((entry) => {
        const age = now - entry.ts
        if (age > ROW_HOLD_S) return null
        const opacity =
          age > ROW_HOLD_S - ROW_FADE_S
            ? Math.max(0, (ROW_HOLD_S - age) / ROW_FADE_S)
            : 1
        const attacker = resolve(entry.attackerId)
        const victim = resolve(entry.victimId)
        return (
          <div key={entry.id} className="kill-feed-row" style={{ opacity }}>
            <NameSpan info={attacker} />
            <span className="kill-feed-arrow">→</span>
            <NameSpan info={victim} />
          </div>
        )
      })}
    </div>
  )
}

function NameSpan({ info }: { info: ResolvedName }) {
  const cls = info.self
    ? 'kill-feed-name self'
    : info.isBot
      ? 'kill-feed-name bot'
      : 'kill-feed-name'
  return (
    <span className={cls}>
      {info.isBot ? `[BOT] ${info.name}` : info.name}
    </span>
  )
}
