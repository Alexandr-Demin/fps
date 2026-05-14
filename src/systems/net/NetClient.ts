import { useGameStore } from '../../state/gameStore'
import { useNetStore } from '../../state/netStore'
import { Input } from '../input/input'
import { playerHandle } from '../movement/PlayerController'
import { AudioBus } from '../audio/AudioSystem'
import { PLAYER, WEAPON } from '../../core/constants'
import { triggerRemoteMuzzleFlash } from './RemotePlayer'
import {
  PROTOCOL_VERSION,
  MP_MAX_HP,
  type C2S,
  type S2C,
  type GameMode,
  type HitZone,
  type PlayerId,
  type RoomId,
} from '@shared/protocol'

// How often we ping the server for RTT measurement.
const PING_INTERVAL_MS = 1000

// Exponential backoff for auto-reconnect after an unexpected WS drop.
// Total ~15.5s budget across 5 attempts — long enough to ride a network
// blip / server-side hot-reload, short enough to give up before the
// user assumes the game is dead. Tunable.
const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000]

class NetClientImpl {
  private ws: WebSocket | null = null
  private myId: string | null = null
  // Promise machinery for `connect()` — resolves on lobbyWelcome (we made
  // it into the lobby) and rejects on reject / close-before-welcome.
  private lobbyResolve: (() => void) | null = null
  private lobbyReject: ((e: Error) => void) | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  // ===== Reconnect bookkeeping =====
  // `manualClose` distinguishes "user clicked leave" (don't try to
  // reconnect) from "the network dropped" (do try). Set to true by
  // disconnect() and read by handleClose().
  private manualClose = false
  private lastNickname = ''
  private lastUrl = ''
  // When the WS drops, remember the room we were in so we can hop back
  // into it after the new lobbyWelcome arrives. Null if we were just
  // sitting in the lobby.
  private pendingRejoinRoomId: RoomId | null = null
  // 1-based index of the next attempt to be scheduled. 0 = not in a
  // reconnect cycle.
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Open a WebSocket to `url`, send `hello`, and resolve once the server
   * sends `lobbyWelcome` (i.e. we're in the lobby and can see / create
   * rooms). Joining a room is a separate step via createRoom() / joinRoom().
   */
  connect(url: string, nickname: string): Promise<void> {
    this.disconnect()
    this.manualClose = false
    this.lastUrl = url
    this.lastNickname = nickname
    return new Promise((resolve, reject) => {
      this.lobbyResolve = resolve
      this.lobbyReject = reject

      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch (e: any) {
        reject(new Error(e?.message ?? 'invalid url'))
        this.lobbyResolve = null
        this.lobbyReject = null
        return
      }
      this.attachSocket(ws)
    })
  }

  /**
   * User-initiated disconnect. Suppresses the auto-reconnect path so a
   * deliberate "BACK / MAIN MENU" cleanly drops the session.
   */
  disconnect() {
    this.manualClose = true
    this.cancelReconnectTimers()
    this.pendingRejoinRoomId = null
    this.lastUrl = ''
    this.lastNickname = ''
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
    this.stopPingLoop()
    this.myId = null
    this.lobbyReject = null
    this.lobbyResolve = null
  }

  /**
   * Abort an in-progress reconnect (called by the reconnect overlay's
   * Cancel button). Tears down state and returns the user to the main
   * menu.
   */
  cancelReconnect() {
    if (!useNetStore.getState().reconnecting) return
    this.giveUpReconnect('cancelled')
  }

  /**
   * Lobby actions. The server replies with `roomJoined` (success) or
   * `reject` (room full / not found). Fire-and-forget on the wire — the
   * UI watches the phase transition for feedback.
   */
  createRoom(mode: GameMode) {
    if (!this.isConnected()) return
    const msg: C2S = { t: 'createRoom', mode }
    this.ws!.send(JSON.stringify(msg))
  }

  joinRoom(roomId: RoomId) {
    if (!this.isConnected()) return
    const msg: C2S = { t: 'joinRoom', roomId }
    this.ws!.send(JSON.stringify(msg))
  }

  /** Back to lobby without closing the socket. */
  leaveRoom() {
    if (!this.isConnected()) return
    const msg: C2S = { t: 'leaveRoom' }
    this.ws!.send(JSON.stringify(msg))
  }

  private startPingLoop() {
    this.stopPingLoop()
    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) return
      const msg: C2S = { t: 'ping', ts: performance.now() }
      try { this.ws!.send(JSON.stringify(msg)) } catch {}
    }, PING_INTERVAL_MS)
  }

  private stopPingLoop() {
    if (this.pingTimer != null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Per-frame heartbeat from NetRoom (only mounted in mpPlaying phases).
   * Sends our current position at ~30Hz; server trusts it and rebroadcasts
   * inside the next snapshot.
   */
  private lastSentAt = 0
  private currentTick = 0
  sendInput() {
    if (!this.isConnected()) return
    if (!playerHandle.body) return
    if (useGameStore.getState().phase !== 'mpPlaying') return
    const now = performance.now()
    if (now - this.lastSentAt < 33) return
    this.lastSentAt = now
    const msg: C2S = {
      t: 'input',
      tick: ++this.currentTick,
      pos: [playerHandle.pos.x, playerHandle.pos.y, playerHandle.pos.z],
      vel: [playerHandle.vel.x, playerHandle.vel.y, playerHandle.vel.z],
      yaw: playerHandle.yaw,
      pitch: playerHandle.pitch,
      state: playerHandle.state,
    }
    this.ws!.send(JSON.stringify(msg))
  }

  sendHit(target: PlayerId, damage: number, zone: HitZone) {
    if (!this.isConnected()) return
    if (useGameStore.getState().phase !== 'mpPlaying') return
    const msg: C2S = { t: 'hit', target, damage, zone }
    this.ws!.send(JSON.stringify(msg))
  }

  sendShot(origin: [number, number, number], dir: [number, number, number]) {
    if (!this.isConnected()) return
    if (useGameStore.getState().phase !== 'mpPlaying') return
    const msg: C2S = { t: 'shoot', origin, dir }
    this.ws!.send(JSON.stringify(msg))
  }

  /**
   * Hook a freshly-constructed WebSocket up to this instance. Used by
   * both the initial `connect()` and the auto-reconnect flow. The
   * on-close handler ignores stale sockets (a prior socket finishing
   * its teardown after we've moved on to a new one) by comparing
   * `this.ws` identity.
   */
  private attachSocket(ws: WebSocket) {
    this.ws = ws
    ws.onopen = () => {
      const hello: C2S = {
        t: 'hello',
        v: PROTOCOL_VERSION,
        nickname: this.lastNickname,
      }
      try { ws.send(JSON.stringify(hello)) } catch {}
    }
    ws.onmessage = (ev) => this.onMessage(ev.data)
    ws.onerror = () => {
      if (this.lobbyReject) this.lobbyReject(new Error('connection error'))
      this.lobbyReject = null
      this.lobbyResolve = null
    }
    ws.onclose = (ev) => {
      if (this.ws !== ws) return // stale socket finishing up; ignore
      if (this.lobbyReject) {
        this.lobbyReject(new Error(`closed: ${ev.reason || ev.code}`))
        this.lobbyReject = null
        this.lobbyResolve = null
      }
      this.handleClose(ev.reason || `code ${ev.code}`)
    }
  }

  private onMessage(raw: any) {
    let msg: S2C
    try { msg = JSON.parse(raw) as S2C } catch { return }
    switch (msg.t) {
      case 'lobbyWelcome': {
        this.myId = msg.you
        useNetStore.getState().setMyId(msg.you)
        useNetStore.getState().setPhase('lobby')
        useNetStore.getState().setError(null)
        useNetStore.getState().setRooms(msg.rooms)
        useNetStore.getState().setCurrentRoomId(null)
        useGameStore.getState().setPhase('mpLobby')
        this.startPingLoop()
        if (this.lobbyResolve) this.lobbyResolve()
        this.lobbyResolve = null
        this.lobbyReject = null

        // If this is a reconnect after a drop, clear the reconnect
        // overlay and attempt to slot back into the previous room.
        if (useNetStore.getState().reconnecting) {
          this.reconnectAttempt = 0
          useNetStore.getState().setReconnect({
            reconnecting: false,
            attempt: 0,
            max: RECONNECT_BACKOFF_MS.length,
          })
        }
        if (this.pendingRejoinRoomId) {
          const targetId = this.pendingRejoinRoomId
          this.pendingRejoinRoomId = null
          const target = msg.rooms.find(
            (r) => r.id === targetId && r.count < r.max,
          )
          if (target) {
            this.joinRoom(targetId)
          } else {
            // Original room is gone or full — leave the user in the lobby
            // with a hint instead of silently doing nothing.
            useNetStore
              .getState()
              .setError('previous room is no longer available')
          }
        }
        break
      }
      case 'roomList': {
        useNetStore.getState().setRooms(msg.rooms)
        break
      }
      case 'roomJoined': {
        const myId = this.myId
        useNetStore.getState().setCurrentRoomId(msg.roomId)
        useGameStore.getState().setCurrentMap(msg.map)
        useGameStore.getState().startMatch()
        useGameStore.getState().setPhase('mpPlaying')
        useNetStore.getState().setPhase('connected')
        useNetStore.getState().setError(null)
        useNetStore
          .getState()
          .upsertRemote(msg.players.filter((p) => p.id !== myId))
        setTimeout(() => Input.requestLock(), 16)
        break
      }
      case 'roomLeft': {
        useNetStore.getState().setCurrentRoomId(null)
        useNetStore.getState().clearRemotes()
        useNetStore.getState().setRooms(msg.rooms)
        useNetStore.getState().setPhase('lobby')
        useGameStore.getState().setPhase('mpLobby')
        break
      }
      case 'reject': {
        // Three contexts:
        //   1. pre-lobbyWelcome on initial connect — fatal; reject promise.
        //   2. during reconnect (protocol mismatch / banned id) — fatal;
        //      give up the reconnect cycle so we don't loop forever.
        //   3. mid-session (room full / not found) — non-fatal; surface
        //      and stay in the lobby.
        if (this.lobbyReject) {
          this.lobbyReject(new Error(msg.reason))
          this.lobbyReject = null
          this.lobbyResolve = null
          this.disconnect()
        } else if (useNetStore.getState().reconnecting) {
          this.giveUpReconnect(msg.reason)
        } else {
          useNetStore.getState().setError(msg.reason)
        }
        break
      }
      case 'snapshot': {
        const myId = this.myId
        useNetStore
          .getState()
          .upsertRemote(msg.players.filter((p) => p.id !== myId))
        break
      }
      case 'playerJoined': {
        if (msg.player.id !== this.myId)
          useNetStore.getState().addRemote(msg.player)
        break
      }
      case 'playerLeft': {
        useNetStore.getState().removeRemote(msg.id)
        break
      }
      case 'damaged': {
        if (msg.target !== this.myId) break
        useGameStore.setState({
          hp: msg.hp,
          lastDamageAt: performance.now() / 1000,
        })
        AudioBus.playHurt()
        break
      }
      case 'died': {
        if (msg.target === this.myId) {
          const remaining = Math.max(0, (msg.respawnAt - Date.now()) / 1000)
          useGameStore.setState((s) => ({
            phase: 'mpDead',
            hp: 0,
            respawnAt: performance.now() / 1000 + remaining,
            deaths: s.deaths + 1,
          }))
        } else {
          useNetStore.setState((s) => {
            const next = { ...s.remotePlayers }
            const r = next[msg.target]
            if (r) next[msg.target] = { ...r, alive: false, hp: 0 }
            return { remotePlayers: next }
          })
        }
        if (msg.attacker === this.myId && msg.target !== this.myId) {
          const targetId = msg.target
          useGameStore.setState((s) => {
            const idx = s.hitEvents.findIndex(
              (e) => e.target === targetId && !e.killed,
            )
            if (idx < 0) return { kills: s.kills + 1 }
            const nextEvents = s.hitEvents.slice()
            nextEvents[idx] = { ...nextEvents[idx], killed: true }
            return {
              kills: s.kills + 1,
              hitEvents: nextEvents,
              hitTotals: { ...s.hitTotals, kills: s.hitTotals.kills + 1 },
            }
          })
          AudioBus.playKillFeedback()
        }
        break
      }
      case 'respawned': {
        if (msg.id === this.myId) {
          if (playerHandle.body) {
            playerHandle.body.setNextKinematicTranslation({
              x: msg.pos[0], y: msg.pos[1], z: msg.pos[2],
            })
            playerHandle.body.setTranslation(
              { x: msg.pos[0], y: msg.pos[1], z: msg.pos[2] }, true
            )
          }
          playerHandle.pos.set(msg.pos[0], msg.pos[1], msg.pos[2])
          playerHandle.vel.set(0, 0, 0)
          useGameStore.setState({
            phase: 'mpPlaying',
            hp: PLAYER.MAX_HP,
            ammo: WEAPON.MAG_SIZE,
            reserve: WEAPON.RESERVE,
            reloading: false,
          })
          setTimeout(() => Input.requestLock(), 16)
        } else {
          useNetStore.setState((s) => {
            const next = { ...s.remotePlayers }
            const r = next[msg.id]
            if (r) {
              next[msg.id] = { ...r, pos: msg.pos, alive: true, hp: MP_MAX_HP }
            }
            return { remotePlayers: next }
          })
        }
        break
      }
      case 'shotFired': {
        if (msg.shooter === this.myId) break
        AudioBus.playPistol(msg.origin)
        triggerRemoteMuzzleFlash(msg.shooter)
        break
      }
      case 'pong': {
        const rtt = performance.now() - msg.ts
        if (rtt >= 0 && rtt < 10000) {
          useNetStore.getState().setRtt(Math.round(rtt))
        }
        break
      }
    }
  }

  private handleClose(reason: string) {
    this.ws = null
    this.myId = null
    this.stopPingLoop()

    if (this.manualClose) {
      // User-initiated leave; reset state and exit. The leaving UI path
      // already flipped phase=menu before calling disconnect(), so no
      // phase change needed here.
      this.manualClose = false
      useNetStore.getState().setPhase('idle')
      useNetStore.getState().clearRemotes()
      useNetStore.getState().setMyId(null)
      useNetStore.getState().setRooms([])
      useNetStore.getState().setCurrentRoomId(null)
      useNetStore.getState().setRtt(null)
      return
    }

    const ph = useGameStore.getState().phase
    const wasInSession =
      ph === 'mpLobby' || ph === 'mpPlaying' ||
      ph === 'mpPaused' || ph === 'mpDead'

    if (wasInSession && this.lastUrl) {
      // Remember the room we were just in so the reconnect can try to
      // jump straight back in. (null if we were sitting in the lobby.)
      this.pendingRejoinRoomId = useNetStore.getState().currentRoomId
      // Don't tear down gameplay state — the scene stays mounted under
      // the reconnect overlay so the player isn't bounced to the menu.
      useNetStore.getState().setRtt(null)
      useNetStore.getState().setError(null)
      this.startReconnect()
      return
    }

    // Pre-session close (we never made it into a match) — clean up
    // quietly. The connect() promise already rejected via the lobbyReject
    // path inside attachSocket.onclose.
    useNetStore.getState().setPhase('idle')
    useNetStore.getState().clearRemotes()
    useNetStore.getState().setMyId(null)
    useNetStore.getState().setRooms([])
    useNetStore.getState().setCurrentRoomId(null)
    useNetStore.getState().setRtt(null)
    if (wasInSession) {
      useNetStore.getState().setError(`disconnected: ${reason}`)
      useGameStore.getState().setPhase('menu')
    }
  }

  // ===== Reconnect cycle =====

  private startReconnect() {
    this.reconnectAttempt = 0
    useNetStore.getState().setReconnect({
      reconnecting: true,
      attempt: 0,
      max: RECONNECT_BACKOFF_MS.length,
    })
    // Release the cursor so the user can hit Cancel on the overlay. The
    // roomJoined handler re-requests pointer lock once we're back in.
    Input.exitLock()
    this.scheduleNextAttempt()
  }

  private scheduleNextAttempt() {
    const idx = this.reconnectAttempt
    if (idx >= RECONNECT_BACKOFF_MS.length) {
      this.giveUpReconnect('connection lost')
      return
    }
    const delay = RECONNECT_BACKOFF_MS[idx]
    this.reconnectAttempt = idx + 1
    useNetStore.getState().setReconnect({
      reconnecting: true,
      attempt: this.reconnectAttempt,
      max: RECONNECT_BACKOFF_MS.length,
    })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openReconnectSocket()
    }, delay)
  }

  private openReconnectSocket() {
    let ws: WebSocket
    try {
      ws = new WebSocket(this.lastUrl)
    } catch {
      this.scheduleNextAttempt()
      return
    }
    // Don't go through `connect()` — no promise to resolve, no reset of
    // manualClose flag (which is already false during a reconnect).
    this.attachSocket(ws)
  }

  private giveUpReconnect(reason: string) {
    this.cancelReconnectTimers()
    this.reconnectAttempt = 0
    this.pendingRejoinRoomId = null
    useNetStore.getState().setReconnect({
      reconnecting: false,
      attempt: 0,
      max: RECONNECT_BACKOFF_MS.length,
    })
    useNetStore.getState().setError(`disconnected: ${reason}`)
    useNetStore.getState().setPhase('idle')
    useNetStore.getState().clearRemotes()
    useNetStore.getState().setMyId(null)
    useNetStore.getState().setRooms([])
    useNetStore.getState().setCurrentRoomId(null)
    useNetStore.getState().setRtt(null)
    // If a partial socket is hanging around, close it without triggering
    // another reconnect.
    if (this.ws) {
      this.manualClose = true
      try { this.ws.close() } catch {}
      this.ws = null
    }
    useGameStore.getState().setPhase('menu')
  }

  private cancelReconnectTimers() {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

export const NetClient = new NetClientImpl()
