import { useNetStore } from '../state/netStore'
import { NetClient } from '../systems/net/NetClient'

/**
 * Overlay shown when the WebSocket dropped unexpectedly and NetClient is
 * cycling through backoff-spaced reconnect attempts. The underlying
 * game phase is preserved (mpPlaying / mpLobby) so the scene stays
 * mounted behind the overlay — once a reconnect succeeds and the
 * previous room is still alive, the user is dropped right back in
 * without a phase shuffle.
 */
export function MpReconnect() {
  const reconnecting = useNetStore((s) => s.reconnecting)
  const attempt = useNetStore((s) => s.reconnectAttempt)
  const max = useNetStore((s) => s.reconnectMaxAttempts)

  if (!reconnecting) return null

  const onCancel = () => {
    NetClient.cancelReconnect()
  }

  return (
    <div className="overlay interactive" style={{ zIndex: 40 }}>
      <div className="dialog-backdrop" />
      <div className="menu" style={{ minWidth: 320, textAlign: 'center' }}>
        <div className="sub">CONNECTION LOST</div>
        <h1>RECONNECTING…</h1>
        <div className="hud-label" style={{ marginTop: 8 }}>
          attempt {attempt} / {max}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Holding your room — we&apos;ll drop you back in if it&apos;s still
          there.
        </div>
        <div className="menu-buttons" style={{ marginTop: 18 }}>
          <button onClick={onCancel}>CANCEL · BACK TO MENU</button>
        </div>
      </div>
    </div>
  )
}
