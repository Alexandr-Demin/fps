import { WebSocket } from 'ws'
import { Player } from './Player.js'
import {
  PROTOCOL_VERSION,
  MP_RESPAWN_MS,
  type C2S,
  type S2C,
  type PlayerSnap,
  type Vec3,
  type MapData,
  type PlayerId,
} from '../../shared/src/protocol.js'

// Defensive cap on a single client-reported hit. Real anti-cheat will come
// in Phase 3; this is just a sanity bound so a typo / glitched packet
// can't reset HP to deeply negative in one shot.
const MAX_DAMAGE_PER_HIT = 200

export class Room {
  private players = new Map<PlayerId, Player>()
  private nextSeq = 0
  private tickCount = 0
  private spawns: Vec3[]

  constructor(public mapData: MapData, public maxPlayers: number) {
    this.spawns = mapData.entities
      .filter((e) => e.kind === 'playerSpawn')
      .map((e) => e.pos as Vec3)
    if (this.spawns.length === 0) this.spawns.push([0, 2.5, 0])
  }

  onConnection(ws: WebSocket) {
    let registered = false
    const helloTimer = setTimeout(() => {
      if (!registered) {
        try { ws.close() } catch {}
      }
    }, 3000)

    ws.on('error', (err) => {
      console.error('[server] ws error:', err)
    })

    ws.once('message', (raw) => {
      if (registered) return
      clearTimeout(helloTimer)

      let msg: C2S
      try { msg = JSON.parse(raw.toString()) as C2S } catch {
        try { ws.close() } catch {}
        return
      }
      if (msg.t !== 'hello') {
        this.sendReject(ws, 'expected hello')
        try { ws.close() } catch {}
        return
      }
      if (msg.v !== PROTOCOL_VERSION) {
        this.sendReject(
          ws,
          `protocol mismatch: server=${PROTOCOL_VERSION}, client=${msg.v}`
        )
        try { ws.close() } catch {}
        return
      }
      if (this.players.size >= this.maxPlayers) {
        this.sendReject(ws, 'room full')
        try { ws.close() } catch {}
        return
      }

      registered = true

      const id = 'p_' + ++this.nextSeq
      const nickname =
        (msg.nickname && msg.nickname.trim().slice(0, 16)) || 'PLAYER_' + id
      const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)]
      const player = new Player(id, nickname, ws, spawn)
      this.players.set(id, player)

      console.log(
        `[server] player ${id} (${nickname}) joined, total=${this.players.size}`
      )

      const playerList: PlayerSnap[] = Array.from(this.players.values()).map(
        (p) => this.playerSnap(p)
      )

      this.send(ws, {
        t: 'welcome',
        you: id,
        map: this.mapData,
        tick: this.tickCount,
        players: playerList,
      })

      this.broadcast({ t: 'playerJoined', player: this.playerSnap(player) }, ws)

      ws.on('message', (data) => {
        let m: C2S
        try { m = JSON.parse(data.toString()) as C2S } catch { return }
        switch (m.t) {
          case 'input':
            if (!player.alive) break
            player.pos = m.pos
            player.vel = m.vel
            player.yaw = m.yaw
            player.pitch = m.pitch
            player.lastInputTick = m.tick
            break
          case 'ping':
            this.send(ws, { t: 'pong', ts: m.ts })
            break
          case 'hit':
            this.onHit(player, m.target, m.damage, m.zone)
            break
          // ignore everything else
        }
      })

      ws.on('close', () => {
        if (!this.players.delete(id)) return
        console.log(`[server] player ${id} left, total=${this.players.size}`)
        this.broadcast({ t: 'playerLeft', id })
      })
    })
  }

  tick() {
    this.tickCount++
    if (this.players.size === 0) return
    // Respawn dead players whose timer has elapsed
    const now = Date.now()
    for (const p of this.players.values()) {
      if (!p.alive && now >= p.deadUntil) {
        const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)]
        p.respawn(spawn)
        this.broadcast({ t: 'respawned', id: p.id, pos: p.pos })
      }
    }
    const players: PlayerSnap[] = []
    for (const p of this.players.values()) players.push(this.playerSnap(p))
    this.broadcast({ t: 'snapshot', tick: this.tickCount, players })
  }

  private onHit(attacker: Player, targetId: PlayerId, damage: number, zone: 'head' | 'torso' | 'legs') {
    if (!attacker.alive) return
    const target = this.players.get(targetId)
    if (!target || !target.alive) return
    if (target === attacker) return  // self-damage disabled (splash etc not implemented)

    // Sanitize damage: clamp to [0, MAX_DAMAGE_PER_HIT]
    const amount = Math.max(0, Math.min(MAX_DAMAGE_PER_HIT, Math.floor(damage)))
    if (amount === 0) return

    target.hp -= amount
    if (target.hp <= 0) {
      target.hp = 0
      target.alive = false
      target.deadUntil = Date.now() + MP_RESPAWN_MS
      attacker.kills++
      target.deaths++
      this.broadcast({
        t: 'died',
        target: target.id,
        attacker: attacker.id,
        respawnAt: target.deadUntil,
      })
    } else {
      this.broadcast({
        t: 'damaged',
        target: target.id,
        attacker: attacker.id,
        amount,
        hp: target.hp,
        zone,
      })
    }
  }

  private playerSnap(p: Player): PlayerSnap {
    return {
      id: p.id,
      nickname: p.nickname,
      pos: p.pos,
      yaw: p.yaw,
      pitch: p.pitch,
      hp: p.hp,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
    }
  }

  private send(ws: WebSocket, msg: S2C) {
    if (ws.readyState !== WebSocket.OPEN) return
    try { ws.send(JSON.stringify(msg)) } catch {}
  }

  private sendReject(ws: WebSocket, reason: string) {
    try { ws.send(JSON.stringify({ t: 'reject', reason } as S2C)) } catch {}
  }

  private broadcast(msg: S2C, except?: WebSocket) {
    const raw = JSON.stringify(msg)
    for (const p of this.players.values()) {
      if (p.ws === except) continue
      if (p.ws.readyState !== WebSocket.OPEN) continue
      try { p.ws.send(raw) } catch {}
    }
  }
}
