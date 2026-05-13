import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { Input } from '../systems/input/input'
import { AudioBus } from '../systems/audio/AudioSystem'
import { LEVELS, COMING_SOON_SLOTS, type LevelEntry } from '../core/levels'
import { filterByKind } from '../core/mapTypes'

export function MainMenu() {
  const phase = useGameStore((s) => s.phase)
  const settingsOpen = useGameStore((s) => s.settingsOpen)
  const startMatch = useGameStore((s) => s.startMatch)
  const resumeMatch = useGameStore((s) => s.resumeMatch)
  const setPhase = useGameStore((s) => s.setPhase)
  const openSettings = useGameStore((s) => s.openSettings)
  const enterEditor = useGameStore((s) => s.enterEditor)
  const kills = useGameStore((s) => s.kills)
  const deaths = useGameStore((s) => s.deaths)

  const showing = phase === 'menu' || phase === 'paused'
  if (!showing || settingsOpen) return null

  const isPaused = phase === 'paused'

  const onDeploy = () => {
    AudioBus.init()
    setPhase('levelSelect')
  }
  const onResume = () => {
    AudioBus.init()
    resumeMatch()
    setTimeout(() => Input.requestLock(), 16)
  }
  const onAbandon = () => {
    setPhase('menu')
  }

  return (
    <div className="overlay interactive">
      <div className="menu">
        <div className="sub">ARENA FPS</div>
        <h1>SECTOR – 17</h1>
        <div className="sub">{isPaused ? 'PAUSED' : 'DEMO V0.2'}</div>

        {isPaused && (
          <div className="hud-label" style={{ marginTop: -10 }}>
            KILLS {String(kills).padStart(2, '0')} · DEATHS {String(deaths).padStart(2, '0')}
          </div>
        )}

        {isPaused ? (
          <div className="menu-buttons">
            <button onClick={onResume}>RESUME</button>
            <button onClick={openSettings}>SETTINGS</button>
            <button onClick={onAbandon}>MAIN MENU</button>
          </div>
        ) : (
          <div className="menu-buttons">
            <button onClick={onDeploy}>DEPLOY · SOLO</button>
            <button onClick={() => setPhase('mpConnect')}>DEATHMATCH</button>
            <button onClick={enterEditor}>EDITOR</button>
            <button onClick={openSettings}>SETTINGS</button>
          </div>
        )}

        <div className="hint">
          WASD — MOVE &nbsp;·&nbsp; MOUSE — AIM &nbsp;·&nbsp; RMB — ADS / SCOPE<br />
          SHIFT — SPRINT &nbsp;·&nbsp; CTRL — SLIDE &nbsp;·&nbsp; SPACE — JUMP<br />
          LMB — FIRE &nbsp;·&nbsp; R — RELOAD &nbsp;·&nbsp; M — MUTE &nbsp;·&nbsp; F2 — EDITOR &nbsp;·&nbsp; ESC — RELEASE
        </div>
      </div>
    </div>
  )
}

export function LevelSelect() {
  const phase = useGameStore((s) => s.phase)
  const setPhase = useGameStore((s) => s.setPhase)
  const setCurrentMap = useGameStore((s) => s.setCurrentMap)
  const startMatch = useGameStore((s) => s.startMatch)

  if (phase !== 'levelSelect') return null

  const onPick = (entry: LevelEntry) => {
    setCurrentMap(entry.map)
    startMatch()
    setTimeout(() => Input.requestLock(), 16)
  }

  return (
    <div className="overlay interactive">
      <div className="menu">
        <div className="sub">SELECT LEVEL</div>
        <h1>DEPLOY · SOLO</h1>
        <div className="sub">CHOOSE YOUR ARENA</div>

        <div className="level-grid">
          {LEVELS.map((entry) => (
            <LevelCard key={entry.id} entry={entry} onPick={onPick} />
          ))}
          {Array.from({ length: COMING_SOON_SLOTS }).map((_, i) => (
            <LevelCard key={`soon-${i}`} comingSoon />
          ))}
        </div>

        <div className="menu-buttons" style={{ marginTop: 8 }}>
          <button onClick={() => setPhase('menu')}>← BACK</button>
        </div>
      </div>
    </div>
  )
}

function LevelCard({
  entry,
  comingSoon,
  onPick,
}: {
  entry?: LevelEntry
  comingSoon?: boolean
  onPick?: (e: LevelEntry) => void
}) {
  if (comingSoon || !entry) {
    return (
      <div className="level-card disabled" title="More maps coming soon">
        <div className="level-card-title">— EMPTY SLOT —</div>
        <div className="level-card-tagline">More arenas coming soon.</div>
        <div className="level-card-stats">
          <span className="menu-badge">SOON</span>
        </div>
      </div>
    )
  }

  const m = entry.map
  const stats = {
    bots: filterByKind(m.entities, 'botSpawn').length,
    spawns: filterByKind(m.entities, 'playerSpawn').length,
    cover:
      filterByKind(m.entities, 'concrete').length +
      filterByKind(m.entities, 'metal').length,
  }

  return (
    <button
      type="button"
      className="level-card"
      onClick={() => onPick?.(entry)}
    >
      <div className="level-card-title">{m.name}</div>
      <div className="level-card-tagline">{entry.tagline}</div>
      <div className="level-card-stats">
        <span>{stats.bots} bot spawns</span>
        <span>·</span>
        <span>{stats.spawns} player spawns</span>
        <span>·</span>
        <span>{stats.cover} blocks</span>
      </div>
      <div className="level-card-cta">DEPLOY ▸</div>
    </button>
  )
}

export function DeathScreen() {
  const phase = useGameStore((s) => s.phase)
  const respawnAt = useGameStore((s) => s.respawnAt)
  const respawnPlayer = useGameStore((s) => s.respawnPlayer)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (phase !== 'dead') return
    let raf = 0
    const tick = () => {
      const left = Math.max(0, respawnAt - performance.now() / 1000)
      setRemaining(left)
      if (left <= 0) {
        respawnPlayer()
        Input.requestLock()
      } else {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, respawnAt, respawnPlayer])

  if (phase !== 'dead') return null
  return (
    <div className="overlay">
      <div className="death">
        <h2>TERMINATED</h2>
        <div className="timer">RESPAWN IN {remaining.toFixed(1)}S</div>
      </div>
    </div>
  )
}
