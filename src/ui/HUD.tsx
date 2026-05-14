import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'
import { PLAYER, WEAPON, MATCH } from '../core/constants'
import { Input } from '../systems/input/input'
import { FpsCounter } from './FpsCounter'
import { HitStats } from './HitStats'

export function HUD() {
  const hp = useGameStore((s) => s.hp)
  const ammo = useGameStore((s) => s.ammo)
  const reserve = useGameStore((s) => s.reserve)
  const reloading = useGameStore((s) => s.reloading)
  const kills = useGameStore((s) => s.kills)
  const deaths = useGameStore((s) => s.deaths)
  const lastHitAt = useGameStore((s) => s.lastHitAt)
  const lastDamageAt = useGameStore((s) => s.lastDamageAt)
  const muted = useGameStore((s) => s.muted)
  const botsCanDamage = useGameStore((s) => s.botsCanDamage)
  const showHitboxes = useGameStore((s) => s.showHitboxes)
  const phase = useGameStore((s) => s.phase)
  // Arena match-clock — null on duel and SP. Re-read each frame via the
  // outer raf below so the displayed countdown stays smooth without
  // forcing a per-second store update.
  const matchEndsAt = useNetStore((s) => s.currentMatchEndsAt)
  // Local-player spawn-protection mirror — drives the PROTECTED pill.
  const myProtected = useNetStore((s) => s.myProtected)
  // In MP, always show the FPS / ping panel — ping is non-debug info
  // players want to see at a glance. SP keeps it as a debug-toggle thing.
  const isMp = phase === 'mpPlaying'
  const debugVisible = showHitboxes || !botsCanDamage || isMp

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

  const hpPct = Math.max(0, hp / PLAYER.MAX_HP) * 100
  const hpLow = hpPct < 30
  const showHitMarker = now - lastHitAt < 0.15
  const damageActive = now - lastDamageAt < 0.25
  const aiming = Input.state.aimHeld

  // MM:SS countdown for arena. now is in seconds-since-epoch via
  // performance.now()/1000 (the existing `now` raf state); matchEndsAt
  // is Date.now() epoch ms — convert. Negative remainders clamp to 0.
  let countdown: string | null = null
  if (isMp && matchEndsAt != null) {
    const remSec = Math.max(0, Math.floor((matchEndsAt - Date.now()) / 1000))
    const mm = Math.floor(remSec / 60)
    const ss = remSec % 60
    countdown = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  return (
    <div className="overlay">
      <div className="scanline-frame" />
      <div className="hud">
        {countdown && (
          <div className="hud-match-clock">{countdown}</div>
        )}
        {isMp && myProtected && (
          <div className="hud-protected-pill">PROTECTED</div>
        )}
        <div className="hud-top">
          <div className="hud-block">
            <div className="hud-label">SECTOR-17 // KZ-7 HEAVY</div>
            <div className="hud-label">{reloading ? 'RELOADING…' : 'READY'}</div>
          </div>
          <div className="hud-block" style={{ alignItems: 'flex-end' }}>
            <div className="hud-label">KILLS / DEATHS</div>
            <div className="hud-value">
              {String(kills).padStart(2, '0')} / {String(deaths).padStart(2, '0')}
            </div>
            <div className="hud-label">TARGET {MATCH.KILL_TARGET}</div>
          </div>
        </div>

        <div className="hud-bottom">
          <div className="hud-block">
            <div className="hud-label">VITALS</div>
            <div className={`hud-value ${hpLow ? 'warn' : ''}`}>
              {String(Math.ceil(hp)).padStart(3, '0')}
            </div>
            <div className="hud-bar">
              <div className={`hud-bar-fill ${hpLow ? 'warn' : ''}`} style={{ width: `${hpPct}%` }} />
            </div>
          </div>
          <div className="hud-block" style={{ alignItems: 'flex-end' }}>
            <div className="hud-label">AMMO</div>
            <div className="hud-value">
              {String(ammo).padStart(2, '0')}
              <span style={{ color: 'var(--fg-dim)', fontSize: 16, marginLeft: 8 }}>
                / {isFinite(reserve) ? String(reserve).padStart(2, '0') : '∞'}
              </span>
            </div>
            <div className="hud-label">{WEAPON.NAME}</div>
          </div>
        </div>
      </div>

      {!aiming && (
        <div className="crosshair">
          <div className="crosshair-dot" />
        </div>
      )}

      {aiming && <div className="ads-vignette" />}

      <div className="hud-pills">
        {muted && <div className="hud-pill muted">SFX OFF · M</div>}
        {!botsCanDamage && <div className="hud-pill safe">SAFE MODE</div>}
        {showHitboxes && <div className="hud-pill debug">HITBOXES</div>}
      </div>

      {debugVisible && <FpsCounter />}
      {/* Hit log is useful gameplay feedback (damage dealt, KILL badge) —
          shown during any in-match phase regardless of the hitbox-wireframes
          debug toggle. */}
      {(phase === 'playing' || phase === 'mpPlaying' ||
        phase === 'mpPaused' || phase === 'mpDead') && <HitStats />}

      {showHitMarker && (
        <div className="hit-marker">
          <span /><span /><span /><span />
        </div>
      )}

      <div className={`damage-vignette ${damageActive ? 'active' : ''}`} />
    </div>
  )
}
