import { useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'
import { NetClient } from '../systems/net/NetClient'
import { AudioBus } from '../systems/audio/AudioSystem'

export function MultiplayerConnect() {
  const phase = useGameStore((s) => s.phase)
  const setPhase = useGameStore((s) => s.setPhase)

  const storedNick = useNetStore((s) => s.nickname)
  const setNickname = useNetStore((s) => s.setNickname)
  const storedUrl = useNetStore((s) => s.serverUrl)
  const setServerUrl = useNetStore((s) => s.setServerUrl)
  const error = useNetStore((s) => s.error)
  const setError = useNetStore((s) => s.setError)
  const setNetPhase = useNetStore((s) => s.setPhase)

  const [localNick, setLocalNick] = useState(storedNick)
  const [localUrl, setLocalUrl] = useState(storedUrl)

  if (phase !== 'mpConnect' && phase !== 'mpConnecting') return null
  const connecting = phase === 'mpConnecting'

  const handleConnect = async () => {
    setError(null)
    const nick = localNick.trim().slice(0, 16) || storedNick
    const url = localUrl.trim() || storedUrl
    setNickname(nick)
    setServerUrl(url)
    setPhase('mpConnecting')
    setNetPhase('connecting')
    try {
      AudioBus.init()
      await NetClient.connect(url, nick)
    } catch (e: any) {
      setError(e?.message ?? 'connection failed')
      setNetPhase('error')
      setPhase('mpConnect')
    }
  }

  const handleBack = () => {
    NetClient.disconnect()
    setNetPhase('idle')
    setError(null)
    setPhase('menu')
  }

  return (
    <div className="overlay interactive">
      <div className="menu">
        <h1>DEATHMATCH</h1>
        <div className="sub">Connect to a server</div>

        <label className="hud-label" style={{ marginTop: 16 }}>
          NICKNAME
        </label>
        <input
          className="mp-input"
          value={localNick}
          maxLength={16}
          disabled={connecting}
          spellCheck={false}
          onChange={(e) => setLocalNick(e.target.value)}
        />

        <label className="hud-label" style={{ marginTop: 10 }}>
          SERVER URL
        </label>
        <input
          className="mp-input"
          value={localUrl}
          disabled={connecting}
          spellCheck={false}
          placeholder="ws://localhost:2567"
          onChange={(e) => setLocalUrl(e.target.value)}
        />

        {error && <div className="mp-error">{error}</div>}

        <div className="menu-buttons" style={{ marginTop: 16 }}>
          <button
            onClick={handleConnect}
            disabled={
              connecting || !localNick.trim() || !localUrl.trim()
            }
          >
            {connecting ? 'CONNECTING…' : 'CONNECT'}
          </button>
          <button onClick={handleBack} disabled={connecting}>
            BACK
          </button>
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          Phase 1 · movement-only · no shooting/HP yet
        </div>
      </div>
    </div>
  )
}
