import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'
import { NetClient } from '../systems/net/NetClient'
import { MAX_PLAYERS_PER_ROOM, type RoomSummary } from '@shared/protocol'

/**
 * Open-rooms lobby. Shows the list of currently-active rooms pushed by the
 * server on join/leave; user picks one to join or creates a new room.
 * Pressing BACK closes the WS and returns to the main menu.
 */
export function MpLobby() {
  const phase = useGameStore((s) => s.phase)
  const setPhase = useGameStore((s) => s.setPhase)
  const rooms = useNetStore((s) => s.rooms)
  const myNick = useNetStore((s) => s.nickname)
  const error = useNetStore((s) => s.error)
  const setError = useNetStore((s) => s.setError)

  if (phase !== 'mpLobby') return null

  const onCreate = () => {
    setError(null)
    NetClient.createRoom()
  }

  const onJoin = (roomId: string) => {
    setError(null)
    NetClient.joinRoom(roomId)
  }

  const onBack = () => {
    // Close the socket; handleClose will only flag an error if phase was
    // already past 'menu', so swap phase first for a silent leave.
    setPhase('menu')
    NetClient.disconnect()
  }

  const waiting = rooms.filter((r) => r.state === 'waiting')
  const playing = rooms.filter((r) => r.state === 'playing')

  return (
    <div className="overlay interactive">
      <div className="menu" style={{ minWidth: 420 }}>
        <div className="sub">ARENA DUEL</div>
        <h1>LOBBY</h1>
        <div className="sub">YOU · {myNick}</div>

        <div className="menu-buttons" style={{ marginTop: 14 }}>
          <button onClick={onCreate}>CREATE DUEL</button>
        </div>

        {error && <div className="mp-error">{error}</div>}

        <label className="hud-label" style={{ marginTop: 18 }}>
          OPEN ROOMS · {waiting.length}
        </label>

        {rooms.length === 0 ? (
          <div className="hint" style={{ marginTop: 4 }}>
            No one is here yet — create a duel and share the page URL.
          </div>
        ) : (
          <div className="lobby-rooms">
            {waiting.map((r) => (
              <RoomRow key={r.id} room={r} onJoin={onJoin} />
            ))}
            {playing.map((r) => (
              <RoomRow key={r.id} room={r} disabled />
            ))}
          </div>
        )}

        <div className="menu-buttons" style={{ marginTop: 18 }}>
          <button onClick={onBack}>BACK</button>
        </div>
      </div>
    </div>
  )
}

function RoomRow({
  room,
  onJoin,
  disabled,
}: {
  room: RoomSummary
  onJoin?: (roomId: string) => void
  disabled?: boolean
}) {
  const full = room.count >= room.max
  const stateLabel = room.state === 'playing' ? 'PLAYING' : 'WAITING'
  return (
    <button
      type="button"
      className={`lobby-room${disabled || full ? ' disabled' : ''}`}
      disabled={disabled || full}
      onClick={() => !disabled && !full && onJoin?.(room.id)}
    >
      <span className="lobby-room-name">{room.hostName}&apos;s duel</span>
      <span className="lobby-room-count">
        {room.count}/{room.max ?? MAX_PLAYERS_PER_ROOM}
      </span>
      <span className={`lobby-room-state ${room.state}`}>{stateLabel}</span>
    </button>
  )
}
