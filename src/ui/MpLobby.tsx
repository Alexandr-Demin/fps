import { useGameStore } from '../state/gameStore'
import { useNetStore } from '../state/netStore'
import { NetClient } from '../systems/net/NetClient'
import { type RoomSummary } from '@shared/protocol'

/**
 * Open-rooms lobby. Split by netStore.lobbyMode:
 *   - 'duel'  → list of waiting DUEL rooms plus a CREATE DUEL button,
 *               classic 1v1 matchmaking
 *   - 'arena' → the singleton ARENA room with its current roster and a
 *               JOIN ARENA button; no create-flow, the server keeps the
 *               room alive at 0/16 between matches.
 *
 * Pressing BACK closes the WS and returns to the main menu.
 */
export function MpLobby() {
  const phase = useGameStore((s) => s.phase)
  const setPhase = useGameStore((s) => s.setPhase)
  const rooms = useNetStore((s) => s.rooms)
  const myNick = useNetStore((s) => s.nickname)
  const error = useNetStore((s) => s.error)
  const setError = useNetStore((s) => s.setError)
  const lobbyMode = useNetStore((s) => s.lobbyMode)

  if (phase !== 'mpLobby') return null

  const onBack = () => {
    // Close the socket; handleClose only flags an error if phase was
    // past 'menu', so swap phase first for a silent leave.
    setPhase('menu')
    NetClient.disconnect()
  }

  return (
    <div className="overlay interactive">
      <div className="menu" style={{ minWidth: 420 }}>
        <div className="sub">{lobbyMode === 'arena' ? 'ARENA' : 'DUEL'}</div>
        <h1>LOBBY</h1>
        <div className="sub">YOU · {myNick}</div>

        {lobbyMode === 'arena' ? (
          <ArenaPanel
            rooms={rooms}
            onError={setError}
            error={error}
          />
        ) : (
          <DuelPanel
            rooms={rooms}
            onError={setError}
            error={error}
          />
        )}

        <div className="menu-buttons" style={{ marginTop: 18 }}>
          <button onClick={onBack}>BACK</button>
        </div>
      </div>
    </div>
  )
}

// ===== DUEL panel =====

function DuelPanel({
  rooms,
  onError,
  error,
}: {
  rooms: RoomSummary[]
  onError: (e: string | null) => void
  error: string | null
}) {
  const onCreate = () => {
    onError(null)
    NetClient.createRoom('duel')
  }
  const onJoin = (roomId: string) => {
    onError(null)
    NetClient.joinRoom(roomId)
  }

  // DUEL lobby only sees duel rooms. The persistent arena singleton is
  // hidden here — it lives on the ARENA screen.
  const duelRooms = rooms.filter((r) => r.mode === 'duel')
  const waiting = duelRooms.filter((r) => r.state === 'waiting')
  const playing = duelRooms.filter((r) => r.state === 'playing')

  return (
    <>
      <div className="menu-buttons" style={{ marginTop: 14 }}>
        <button onClick={onCreate}>CREATE DUEL</button>
      </div>

      {error && <div className="mp-error">{error}</div>}

      <label className="hud-label" style={{ marginTop: 18 }}>
        OPEN DUELS · {waiting.length}
      </label>

      {duelRooms.length === 0 ? (
        <div className="hint" style={{ marginTop: 4 }}>
          No one is here yet — create a duel and share the page URL.
        </div>
      ) : (
        <div className="lobby-rooms">
          {waiting.map((r) => (
            <DuelRow key={r.id} room={r} onJoin={onJoin} />
          ))}
          {playing.map((r) => (
            <DuelRow key={r.id} room={r} disabled />
          ))}
        </div>
      )}
    </>
  )
}

function DuelRow({
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
      <span className="lobby-room-mode duel">DUEL</span>
      <span className="lobby-room-name">{room.hostName}&apos;s room</span>
      <span className="lobby-room-count">
        {room.count}/{room.max}
      </span>
      <span className={`lobby-room-state ${room.state}`}>{stateLabel}</span>
    </button>
  )
}

// ===== ARENA panel =====

function ArenaPanel({
  rooms,
  onError,
  error,
}: {
  rooms: RoomSummary[]
  onError: (e: string | null) => void
  error: string | null
}) {
  // There's at most one arena room on the server. The first JOIN
  // creates it lazily, so when no one's ever joined it the list may be
  // empty — that's fine, we still show the "0 / 16" panel and JOIN
  // will trigger the create-on-first-join path.
  const arena = rooms.find((r) => r.mode === 'arena') ?? null
  const count = arena?.count ?? 0
  const max = arena?.max ?? 16
  const players = arena?.playerNames ?? []
  const full = count >= max

  const onJoin = () => {
    onError(null)
    // Server picks the singleton arena room — createRoom('arena') is
    // idempotent and resolves to the existing room when one exists.
    NetClient.createRoom('arena')
  }

  return (
    <>
      <div className="menu-buttons" style={{ marginTop: 14 }}>
        <button
          className="menu-arena"
          onClick={onJoin}
          disabled={full}
          title={full ? 'arena is full' : undefined}
        >
          JOIN ARENA
        </button>
      </div>

      {error && <div className="mp-error">{error}</div>}

      <label className="hud-label" style={{ marginTop: 18 }}>
        PLAYERS · {count} / {max}
      </label>

      <div className="lobby-rooms">
        {players.length === 0 ? (
          <div className="hint" style={{ marginTop: 4 }}>
            No one in the arena yet — be the first.
          </div>
        ) : (
          players.map((name, i) => (
            <div key={`${name}-${i}`} className="lobby-player-row">
              <span className="lobby-player-dot" />
              <span className="lobby-player-name">{name}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
