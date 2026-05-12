import { useEffect } from 'react'
import { useGameStore } from '../state/gameStore'
import { AudioBus } from '../systems/audio/AudioSystem'

export function SettingsDialog() {
  const open = useGameStore((s) => s.settingsOpen)
  const close = useGameStore((s) => s.closeSettings)
  const muted = useGameStore((s) => s.muted)
  const toggleMute = useGameStore((s) => s.toggleMute)
  const botsCanDamage = useGameStore((s) => s.botsCanDamage)
  const setBotsCanDamage = useGameStore((s) => s.setBotsCanDamage)
  const showHitboxes = useGameStore((s) => s.showHitboxes)
  const setShowHitboxes = useGameStore((s) => s.setShowHitboxes)

  // Reflect mute changes into the audio bus
  useEffect(() => {
    AudioBus.setMuted(muted)
  }, [muted])

  // ESC closes the dialog without resuming the match
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any)
  }, [open, close])

  if (!open) return null

  return (
    <div className="overlay interactive" style={{ zIndex: 30 }}>
      <div className="dialog-backdrop" onClick={close} />
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <div className="sub">SETTINGS</div>
          <button className="dialog-close" onClick={close} aria-label="Close">×</button>
        </div>

        <div className="dialog-section">
          <div className="hud-label">AUDIO</div>
          <button
            className={`toggle-btn ${muted ? 'off' : 'on'}`}
            onClick={toggleMute}
          >
            <span className="toggle-track">
              <span className="toggle-knob" />
            </span>
            <span>SOUND: {muted ? 'OFF' : 'ON'}</span>
          </button>
        </div>

        <div className="dialog-section">
          <div className="hud-label">COMBAT</div>
          <div className="hud-label" style={{ marginTop: 4, marginBottom: 8 }}>
            Боты наносят урон
          </div>
          <div className="radio-group">
            <label className="radio-row">
              <input
                type="radio"
                name="bots-damage"
                checked={botsCanDamage === true}
                onChange={() => setBotsCanDamage(true)}
              />
              <span>ВКЛЮЧЕНО</span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="bots-damage"
                checked={botsCanDamage === false}
                onChange={() => setBotsCanDamage(false)}
              />
              <span>ВЫКЛЮЧЕНО · режим тира</span>
            </label>
          </div>
        </div>

        <div className="dialog-section">
          <div className="hud-label">DEBUG</div>
          <div className="hud-label" style={{ marginTop: 4, marginBottom: 8 }}>
            Отображение хитбоксов · head ×2, torso ×1, legs ×0.7
          </div>
          <div className="radio-group">
            <label className="radio-row">
              <input
                type="radio"
                name="show-hitboxes"
                checked={showHitboxes === true}
                onChange={() => setShowHitboxes(true)}
              />
              <span>ПОКАЗАТЬ</span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="show-hitboxes"
                checked={showHitboxes === false}
                onChange={() => setShowHitboxes(false)}
              />
              <span>СКРЫТЬ</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button onClick={close}>ЗАКРЫТЬ</button>
        </div>
      </div>
    </div>
  )
}
