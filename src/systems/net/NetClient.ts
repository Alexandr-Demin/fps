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
  type HitZone,
  type PlayerId,
  type RoomId,
} from '@shared/protocol'

// How often we ping the server for RTT measurement.
const PING_INTERVAL_MS = 1000

class NetClientImpl {
  private ws: WebSocket | null = null
  private lastSentAt = 0
  private currentTick = 0
  private myId: string | null = null
  // Promise machinery for `connect()` — resolves on lobbyWelcome (we made
  // it into the lobby) and rejects on reject / close-before-welcome.
  private lobbyResolve: (() => void) | null = null
  private lobbyReject: ((e: Error) => void) | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  /**
   * Open a WebSocket to `url`, send `hello`, and resolve once the server
   * sends `lobbyWelcome` (i.e. we're in the lobby and can see / create
   * rooms). Joining a room is a separate step via createRoom() / joinRoom().
   */
  connect(url: string, nickname: string): Promise<void> {
    this.disconnect()
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
      this.ws = ws

      ws.onopen = () => {
        const hello: C2S = { t: 'hello', v: PROTOCOL_VERSION, nickname }
        ws.send(JSON.stringify(hello))
      }
      ws.onmessage = (ev) => this.onMessage(ev.data)
      ws.onerror = () => {
        if (this.lobbyReject) this.lobbyReject(new Error('connection error'))
        this.lobbyReject = null
        this.lobbyResolve = null
      }
      ws.onclose = (ev) => {
        if (this.lobbyReject) {
          this.lobbyReject(new Error(`closed: ${ev.reason || ev.code}`))
          this.lobbyReject = null
          this.lobbyResolve = null
        }
        this.handleClose(ev.reason || `code ${ev.code}`)
      }
    })
  }

  disconnect() {
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
   * Lobby actions. The server replies with `roomJoined` (success) or
   * `reject` (room full / not found). Fire-and-forget on the wire — the
   * UI watches the phase transition for feedback.
   */
  createRoom() {
    if (!this.isConnected()) return
    const msg: C2S = { t: 'createRoom' }
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

  sendInput() {
    if (!this.isConnected()) return
    if (!playerHandle.body) return
    // While paused (mpPaused) / dead (mpDead), NetRoom is still mounted so
    // remote players keep interpolating — but we stop sending our own input
    // so the server sees us as stationary.
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
    }
    this.ws!.send(JSON.stringify(msg))
  }

  /**
   * Forward a client-resolved hit to the server. The shooter's machine ran
   * hitscan against the remote player's sensor collider and computed the
   * damage value + zone; we just relay. Server validates target/attacker
   * are alive and clamps the damage value defensively.
   */
  sendHit(target: PlayerId, damage: number, zone: HitZone) {
    if (!this.isConnected()) return
    if (useGameStore.getState().phase !== 'mpPlaying') return
    const msg: C2S = { t: 'hit', target, damage, zone }
    this.ws!.send(JSON.stringify(msg))
  }

  /**
   * Tell the server we just fired so it can broadcast a `shotFired` event
   * to other clients for positional gunfire audio. Server doesn't
   * validate or simulate this — pure cosmetic relay.
   */
  sendShot(origin: [number, number, number], dir: [number, number, number]) {
    if (!this.isConnected()) return
    if (useGameStore.getState().phase !== 'mpPlaying') return
    const msg: C2S = { t: 'shoot', origin, dir }
    this.ws!.send(JSON.stringify(msg))
  }

  private onMessage(raw: any) {
    let msg: S2C
    try { msg = JSON.parse(raw) as S2C } catch { return }
    switch (msg.t) {
      case 'lobbyWelcome': {
        // We're in the lobby. Resolve the connect() promise; the UI flips
        // to mpLobby and watches `rooms` for the open-rooms list. Joining
        // / creating a room comes later via explicit user action.
        this.myId = msg.you
        useNetStore.getState().setMyId(msg.you)
        useNetStore.getState().setPhase('lobby')
        useNetStore.getState().setError(null)
        useNetStore.getState().setRooms(msg.rooms)
        useNetStore.getState().setCurrentRoomId(null)
        useGameStore.getState().setPhase('mpLobby')
        // Ping starts in the lobby so RTT is already warm by the time a
        // match starts. (Server replies pong in any phase.)
        this.startPingLoop()
        if (this.lobbyResolve) this.lobbyResolve()
        this.lobbyResolve = null
        this.lobbyReject = null
        break
      }
      case 'roomList': {
        useNetStore.getState().setRooms(msg.rooms)
        break
      }
      case 'roomJoined': {
        // We've been placed into a room — either via createRoom (we're
        // alone) or joinRoom (someone else is the host). Same activation
        // path as the old `welcome`: load map, start match, enter
        // mpPlaying, prime remote players.
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
        // Server confirmed we're back in the lobby. Drop game state and
        // wait for the user to pick / create another room.
        useNetStore.getState().setCurrentRoomId(null)
        useNetStore.getState().clearRemotes()
        useNetStore.getState().setRooms(msg.rooms)
        useNetStore.getState().setPhase('lobby')
        useGameStore.getState().setPhase('mpLobby')
        break
      }
      case 'reject': {
        // Two distinct contexts:
        //   1. pre-lobbyWelcome (protocol mismatch, hello format) — fatal;
        //      surface and close.
        //   2. mid-session (room full / not found) — non-fatal; surface
        //      and stay in the lobby.
        if (this.lobbyReject) {
          this.lobbyReject(new Error(msg.reason))
          this.lobbyReject = null
          this.lobbyResolve = null
          this.disconnect()
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
        // Only react to damage dealt to us; remote players' HP updates
        // ride along on the next snapshot.
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
          // Local death — switch to mpDead, schedule respawn via
          // server-given timestamp converted to performance.now() time-base.
          const remaining = Math.max(0, (msg.respawnAt - Date.now()) / 1000)
          useGameStore.setState((s) => ({
            phase: 'mpDead',
            hp: 0,
            respawnAt: performance.now() / 1000 + remaining,
            deaths: s.deaths + 1,
          }))
        } else {
          // Remote died — hide their capsule immediately rather than
          // waiting for the next snapshot to land alive=false (otherwise
          // the body lingers at the kill spot for up to ~33ms).
          useNetStore.setState((s) => {
            const next = { ...s.remotePlayers }
            const r = next[msg.target]
            if (r) next[msg.target] = { ...r, alive: false, hp: 0 }
            return { remotePlayers: next }
          })
        }
        // Whoever killed (could be us, remotely): if we did, score it and
        // flip the KILL badge on the most recent hit-log entry for this
        // target (recorded as killed=false at fire time). One setState
        // so kills bump + log update + accuracy-stats kill bump land as a
        // single batched update.
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
          // Teleport BEFORE flipping phase so PlayerController's useFrame
          // doesn't run a tick from the dead-position before being told
          // about the new one.
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
          // ESC / Alt may have released the cursor; re-capture.
          setTimeout(() => Input.requestLock(), 16)
        } else {
          // Remote respawned — make them visible again immediately at the
          // new spawn (don't wait for the next snapshot).
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
        // Other player fired — play positional pistol audio at their
        // origin and flash their model's muzzle. RemotePlayer's useFrame
        // reads the stamped timestamp and decays the flash over ~70ms.
        if (msg.shooter === this.myId) break
        AudioBus.playPistol(msg.origin)
        triggerRemoteMuzzleFlash(msg.shooter)
        break
      }
      case 'pong': {
        // RTT = current time − ts we stamped into the ping. Server echoes
        // ts verbatim, so this is a pure round-trip with no server-side
        // clock dependency.
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
    const ph = useGameStore.getState().phase
    // Treat an unexpected close as an error if we were past the connect
    // screen (i.e. in lobby or in a match). A manual leave sets phase
    // = 'menu' before disconnect(), so this branch won't fire then.
    const wasInSession =
      ph === 'mpLobby' || ph === 'mpPlaying' ||
      ph === 'mpPaused' || ph === 'mpDead'
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
}

export const NetClient = new NetClientImpl()
