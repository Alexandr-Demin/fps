import { useGameStore } from '../../state/gameStore'
import { useNetStore } from '../../state/netStore'
import { Input } from '../input/input'
import { playerHandle } from '../movement/PlayerController'
import { PROTOCOL_VERSION, type C2S, type S2C } from '@shared/protocol'

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
    // While paused (mpPaused), NetRoom is still mounted so remote players
    // keep interpolating — but we stop sending our own input so the server
    // sees us as stationary.
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
      case 'pong':
        // TODO Phase 2: RTT measurement
        break
    }
  }

  private handleClose(reason: string) {
    this.ws = null
    this.myId = null
    const ph = useGameStore.getState().phase
    // Treat an unexpected close (during active play OR while paused) as an
    // error and surface it; a manual leave sets phase = 'menu' before
    // calling disconnect, so this branch won't fire in that case.
    const wasInGame = ph === 'mpPlaying' || ph === 'mpPaused'
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
