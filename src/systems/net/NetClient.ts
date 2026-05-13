import { useGameStore } from '../../state/gameStore'
import { useNetStore } from '../../state/netStore'
import { Input } from '../input/input'
import { playerHandle } from '../movement/PlayerController'
import { AudioBus } from '../audio/AudioSystem'
import { PLAYER, WEAPON } from '../../core/constants'
import {
  PROTOCOL_VERSION,
  MP_MAX_HP,
  type C2S,
  type S2C,
  type HitZone,
  type PlayerId,
} from '@shared/protocol'

class NetClientImpl {
  private ws: WebSocket | null = null
  private lastSentAt = 0
  private currentTick = 0
  private myId: string | null = null
  private welcomeResolve: (() => void) | null = null
  private welcomeReject: ((e: Error) => void) | null = null

  connect(url: string, nickname: string): Promise<void> {
    this.disconnect()
    return new Promise((resolve, reject) => {
      this.welcomeResolve = resolve
      this.welcomeReject = reject

      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch (e: any) {
        reject(new Error(e?.message ?? 'invalid url'))
        this.welcomeResolve = null
        this.welcomeReject = null
        return
      }
      this.ws = ws

      ws.onopen = () => {
        const hello: C2S = { t: 'hello', v: PROTOCOL_VERSION, nickname }
        ws.send(JSON.stringify(hello))
      }
      ws.onmessage = (ev) => this.onMessage(ev.data)
      ws.onerror = () => {
        if (this.welcomeReject) this.welcomeReject(new Error('connection error'))
        this.welcomeReject = null
        this.welcomeResolve = null
      }
      ws.onclose = (ev) => {
        if (this.welcomeReject) {
          this.welcomeReject(new Error(`closed: ${ev.reason || ev.code}`))
          this.welcomeReject = null
          this.welcomeResolve = null
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
    this.myId = null
    this.welcomeReject = null
    this.welcomeResolve = null
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

  private onMessage(raw: any) {
    let msg: S2C
    try { msg = JSON.parse(raw) as S2C } catch { return }
    switch (msg.t) {
      case 'welcome': {
        this.myId = msg.you
        useGameStore.getState().setCurrentMap(msg.map)
        useGameStore.getState().startMatch()
        useGameStore.getState().setPhase('mpPlaying')
        useNetStore.getState().setMyId(msg.you)
        useNetStore.getState().setPhase('connected')
        useNetStore.getState().setError(null)
        useNetStore
          .getState()
          .upsertRemote(msg.players.filter((p) => p.id !== msg.you))
        setTimeout(() => Input.requestLock(), 16)
        if (this.welcomeResolve) this.welcomeResolve()
        this.welcomeResolve = null
        this.welcomeReject = null
        break
      }
      case 'reject': {
        if (this.welcomeReject) this.welcomeReject(new Error(msg.reason))
        this.welcomeReject = null
        this.welcomeResolve = null
        this.disconnect()
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
        // Whoever killed (could be us, remotely): if we did, score it.
        if (msg.attacker === this.myId && msg.target !== this.myId) {
          useGameStore.setState((s) => ({ kills: s.kills + 1 }))
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
      case 'pong':
        // TODO Phase 2: RTT measurement
        break
    }
  }

  private handleClose(reason: string) {
    this.ws = null
    this.myId = null
    const ph = useGameStore.getState().phase
    // Treat an unexpected close (during active play, while paused, or
    // mid-respawn) as an error and surface it; a manual leave sets phase
    // = 'menu' before calling disconnect, so this branch won't fire then.
    const wasInGame = ph === 'mpPlaying' || ph === 'mpPaused' || ph === 'mpDead'
    useNetStore.getState().setPhase('idle')
    useNetStore.getState().clearRemotes()
    useNetStore.getState().setMyId(null)
    if (wasInGame) {
      useNetStore.getState().setError(`disconnected: ${reason}`)
      useGameStore.getState().setPhase('menu')
    }
  }
}

export const NetClient = new NetClientImpl()
