import WebSocket from 'ws'

// MP load-test harness. Opens N synthetic WS clients against the same server,
// drives one of them as room host and the rest as joiners into a single room,
// then runs an input-streaming + ping-probing loop for DURATION_S seconds.
// At the end, prints aggregate metrics: snapshot rate, RTT percentiles,
// per-client bytes/sec, drop counts.
//
// Defaults to creating an arena room (16-player cap built-in). For
// larger N, start the server with MAX_PLAYERS=N to override the per-mode
// cap — drop the env var afterwards to restore the per-mode defaults.
//
// Usage:
//   WS_URL=wss://arena.example/ N=16 DURATION_S=60 node scripts/loadtest.mjs
//
// Env knobs (all optional):
//   WS_URL          target WS endpoint   (default ws://127.0.0.1:2567)
//   N               client count         (default 16)
//   DURATION_S      test duration in s   (default 60)
//   MODE            'duel' | 'arena'     (default arena — 16 cap built-in)
//   INPUT_HZ        client send rate     (default 30 — matches server tick)
//   PING_HZ         ping send rate       (default 1)
//   PROTOCOL_VER    protocol version     (default 4, must match server)
//   NICK_PREFIX     nickname prefix      (default LT)
//   STAGGER_MS      gap between connects (default 50 — avoid handshake storm)

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:2567'
const N = Number(process.env.N ?? 16)
const DURATION_S = Number(process.env.DURATION_S ?? 60)
const INPUT_HZ = Number(process.env.INPUT_HZ ?? 30)
const PING_HZ = Number(process.env.PING_HZ ?? 1)
const PROTOCOL_VERSION = Number(process.env.PROTOCOL_VER ?? 10)
const NICK_PREFIX = process.env.NICK_PREFIX ?? 'LT'
const STAGGER_MS = Number(process.env.STAGGER_MS ?? 50)
// Mode of the room the host creates. 'arena' is the safer default for
// load testing — duel rooms cap at 2 in normal operation and need the
// MAX_PLAYERS env override on the server side; arena rooms cap at 16
// out of the box, so the harness works without server-side tweaks for
// any N ≤ 16. For larger N still set MAX_PLAYERS on the server.
const MODE = process.env.MODE ?? 'arena'

const INPUT_PERIOD_MS = 1000 / INPUT_HZ
const PING_PERIOD_MS = 1000 / PING_HZ

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  return sorted[idx]
}

function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return 'n/a'
  if (typeof n !== 'number') return String(n)
  return n.toFixed(digits)
}

// Tracks one synthetic client.
class Client {
  constructor(idx) {
    this.idx = idx
    this.nick = `${NICK_PREFIX}_${String(idx).padStart(2, '0')}`
    this.ws = null
    this.you = null              // server-assigned player id
    this.roomId = null
    this.connected = false
    this.welcomed = false
    this.joined = false
    this.error = null
    this.snapshotCount = 0
    this.bytesIn = 0
    this.bytesOut = 0
    this.rtts = []               // ms
    this.pingsInFlight = new Map() // ts -> sendWallclock
    this.lastSnapshotAt = null
    this.snapshotGaps = []       // ms between consecutive snapshots
    this.died = 0
    this.damaged = 0
    this.rejects = []
    this.closedCode = null
  }

  async connectAndJoin(hostRoomIdPromise, isHost) {
    return new Promise((resolve, reject) => {
      let resolved = false
      const finish = (err) => {
        if (resolved) return
        resolved = true
        if (err) {
          this.error = err.message || String(err)
          reject(err)
        } else {
          resolve()
        }
      }

      const timeout = setTimeout(() => finish(new Error('join timeout')), 20000)

      const ws = new WebSocket(URL)
      this.ws = ws

      ws.on('open', () => {
        this.connected = true
        this.sendRaw({ t: 'hello', v: PROTOCOL_VERSION, nickname: this.nick })
      })

      ws.on('message', async (raw) => {
        this.bytesIn += raw.length ?? raw.byteLength ?? 0
        let m
        try { m = JSON.parse(raw.toString()) } catch { return }
        switch (m.t) {
          case 'lobbyWelcome':
            this.welcomed = true
            this.you = m.you
            if (isHost) {
              this.sendRaw({ t: 'createRoom', mode: MODE })
            }
            // joiners wait for hostRoomIdPromise
            break
          case 'roomJoined':
            this.joined = true
            this.roomId = m.roomId
            clearTimeout(timeout)
            finish()
            break
          case 'roomList':
            // joiners may also get roomList; ignore — we use the explicit promise.
            break
          case 'snapshot': {
            this.snapshotCount++
            const now = Date.now()
            if (this.lastSnapshotAt != null) {
              this.snapshotGaps.push(now - this.lastSnapshotAt)
            }
            this.lastSnapshotAt = now
            break
          }
          case 'pong': {
            const sentAt = this.pingsInFlight.get(m.ts)
            if (sentAt != null) {
              this.rtts.push(Date.now() - sentAt)
              this.pingsInFlight.delete(m.ts)
            }
            break
          }
          case 'damaged':
            this.damaged++
            break
          case 'died':
            this.died++
            break
          case 'reject':
            this.rejects.push(m.reason)
            finish(new Error('reject: ' + m.reason))
            break
        }
      })

      ws.on('error', (e) => finish(e))
      ws.on('close', (code) => {
        this.closedCode = code
        if (!resolved) finish(new Error('closed before join, code=' + code))
      })

      // joiners: wait for the host room id, then send joinRoom
      if (!isHost) {
        hostRoomIdPromise.then((roomId) => {
          // Wait until we got lobbyWelcome before joining.
          const tryJoin = () => {
            if (this.welcomed) {
              this.sendRaw({ t: 'joinRoom', roomId })
            } else if (this.connected) {
              setTimeout(tryJoin, 50)
            } else {
              setTimeout(tryJoin, 100)
            }
          }
          tryJoin()
        })
      }
    })
  }

  sendRaw(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const s = JSON.stringify(obj)
    this.bytesOut += s.length
    try { this.ws.send(s) } catch {}
  }

  startTraffic() {
    // Input: random walk in a 20m cube.
    let tick = 0
    let x = (Math.random() - 0.5) * 10
    let z = (Math.random() - 0.5) * 10
    let y = 1.6
    let yaw = Math.random() * Math.PI * 2
    let pitch = 0
    this.inputTimer = setInterval(() => {
      tick++
      // Slight drift to keep the server actually doing work, not just dedupe.
      x += (Math.random() - 0.5) * 0.2
      z += (Math.random() - 0.5) * 0.2
      yaw += (Math.random() - 0.5) * 0.1
      this.sendRaw({
        t: 'input',
        tick,
        pos: [x, y, z],
        vel: [0, 0, 0],
        yaw,
        pitch,
        state: 'standing',
      })
    }, INPUT_PERIOD_MS)

    // Ping for RTT.
    this.pingTimer = setInterval(() => {
      const ts = Date.now()
      this.pingsInFlight.set(ts, ts)
      this.sendRaw({ t: 'ping', ts })
      // Drop stale entries (>10s)
      for (const [k] of this.pingsInFlight) {
        if (ts - k > 10000) this.pingsInFlight.delete(k)
      }
    }, PING_PERIOD_MS)
  }

  stopTraffic() {
    if (this.inputTimer) clearInterval(this.inputTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
  }

  close() {
    try { this.ws?.close() } catch {}
  }
}

function summarize(clients, durationMs) {
  const lines = []
  const ok = clients.filter((c) => c.joined)
  const failed = clients.filter((c) => !c.joined)
  const allRtts = []
  let totalSnapshots = 0
  let totalBytesIn = 0
  let totalBytesOut = 0
  let totalDamaged = 0
  let totalDied = 0
  const snapshotRates = []
  const meanRtts = []
  const p95Rtts = []
  for (const c of ok) {
    allRtts.push(...c.rtts)
    totalSnapshots += c.snapshotCount
    totalBytesIn += c.bytesIn
    totalBytesOut += c.bytesOut
    totalDamaged += c.damaged
    totalDied += c.died
    snapshotRates.push(c.snapshotCount / (durationMs / 1000))
    if (c.rtts.length) {
      const mean = c.rtts.reduce((a, b) => a + b, 0) / c.rtts.length
      const sorted = [...c.rtts].sort((a, b) => a - b)
      meanRtts.push(mean)
      p95Rtts.push(quantile(sorted, 0.95))
    }
  }
  const sortedAllRtts = [...allRtts].sort((a, b) => a - b)
  const meanRttAll =
    allRtts.length ? allRtts.reduce((a, b) => a + b, 0) / allRtts.length : null
  const meanSnapRate =
    snapshotRates.length
      ? snapshotRates.reduce((a, b) => a + b, 0) / snapshotRates.length
      : 0
  const minSnapRate = snapshotRates.length ? Math.min(...snapshotRates) : 0
  const maxSnapRate = snapshotRates.length ? Math.max(...snapshotRates) : 0

  lines.push('═════════════════════════════════════════════════════════')
  lines.push(`Load test against ${URL}`)
  lines.push(`Clients: requested=${clients.length}  joined=${ok.length}  failed=${failed.length}`)
  lines.push(`Duration: ${(durationMs / 1000).toFixed(1)}s  input=${INPUT_HZ}Hz  ping=${PING_HZ}Hz`)
  lines.push('─────────────────────────────────────────────────────────')
  lines.push(`Snapshots received (total): ${totalSnapshots}`)
  lines.push(`Snapshot rate per client (mean/min/max Hz): ${fmt(meanSnapRate)}  ${fmt(minSnapRate)}  ${fmt(maxSnapRate)}`)
  lines.push(`Expected server tick ~30Hz → each client should see ~30 snapshots/s`)
  lines.push(`Bytes in (sum, all clients): ${totalBytesIn}  (~${fmt(totalBytesIn / (durationMs / 1000) / 1024)} KiB/s server outbound)`)
  lines.push(`Bytes out (sum, all clients): ${totalBytesOut}  (~${fmt(totalBytesOut / (durationMs / 1000) / 1024)} KiB/s server inbound)`)
  lines.push('─────────────────────────────────────────────────────────')
  lines.push(`RTT samples (ping→pong, ms): n=${allRtts.length}`)
  lines.push(`  mean=${fmt(meanRttAll)}  p50=${fmt(quantile(sortedAllRtts, 0.5))}  p95=${fmt(quantile(sortedAllRtts, 0.95))}  p99=${fmt(quantile(sortedAllRtts, 0.99))}  max=${fmt(sortedAllRtts[sortedAllRtts.length - 1])}`)
  lines.push('─────────────────────────────────────────────────────────')
  // Snapshot-gap analysis — picks up server-side stalls.
  const allGaps = []
  for (const c of ok) allGaps.push(...c.snapshotGaps)
  const sortedGaps = [...allGaps].sort((a, b) => a - b)
  lines.push(`Snapshot gap (ms): n=${allGaps.length}  p50=${fmt(quantile(sortedGaps, 0.5))}  p95=${fmt(quantile(sortedGaps, 0.95))}  p99=${fmt(quantile(sortedGaps, 0.99))}  max=${fmt(sortedGaps[sortedGaps.length - 1])}`)
  lines.push(`(server tick = 33.3ms target; gaps >> that = stalls)`)
  lines.push('─────────────────────────────────────────────────────────')
  if (failed.length) {
    lines.push('FAILED CLIENTS:')
    for (const c of failed) {
      lines.push(`  ${c.nick}: connected=${c.connected} welcomed=${c.welcomed} error=${c.error} closed=${c.closedCode}`)
    }
    lines.push('─────────────────────────────────────────────────────────')
  }
  lines.push(`Combat broadcast counts seen: damaged=${totalDamaged}  died=${totalDied}  (should be 0 — no hits sent)`)
  lines.push('═════════════════════════════════════════════════════════')
  return lines.join('\n')
}

async function main() {
  console.log(`[loadtest] target=${URL}  N=${N}  mode=${MODE}  duration=${DURATION_S}s  inputHz=${INPUT_HZ}  pingHz=${PING_HZ}  protocol=v${PROTOCOL_VERSION}`)
  if (N > 16 && MODE === 'arena') {
    console.log(`[loadtest] reminder: N=${N} exceeds arena's built-in cap of 16 — start the server with MAX_PLAYERS=${N} to override`)
  } else if (N > 2 && MODE === 'duel') {
    console.log(`[loadtest] reminder: N=${N} exceeds duel's built-in cap of 2 — start the server with MAX_PLAYERS=${N} to override`)
  }

  const clients = Array.from({ length: N }, (_, i) => new Client(i))

  // Stage 1: connect host (idx 0), wait for it to create the room.
  let resolveRoomId
  const hostRoomIdPromise = new Promise((r) => { resolveRoomId = r })

  const hostJoin = clients[0].connectAndJoin(hostRoomIdPromise, true)
    .then(() => {
      if (clients[0].roomId) resolveRoomId(clients[0].roomId)
    })
    .catch((e) => {
      console.error(`[loadtest] host failed: ${e.message}`)
      process.exit(1)
    })

  // Stage 2: wait for room id, then connect joiners with a small stagger.
  const roomId = await Promise.race([
    new Promise((r) => {
      const iv = setInterval(() => {
        if (clients[0].roomId) { clearInterval(iv); r(clients[0].roomId) }
      }, 50)
    }),
    sleep(10000).then(() => null),
  ])
  if (!roomId) {
    console.error('[loadtest] host did not enter a room within 10s — aborting')
    process.exit(1)
  }
  resolveRoomId(roomId)
  await hostJoin
  console.log(`[loadtest] host in room ${roomId}, joining ${N - 1} more...`)

  const joinerPromises = []
  for (let i = 1; i < N; i++) {
    joinerPromises.push(clients[i].connectAndJoin(hostRoomIdPromise, false).catch((e) => {
      console.error(`[loadtest] joiner ${clients[i].nick} failed: ${e.message}`)
    }))
    await sleep(STAGGER_MS)
  }
  await Promise.all(joinerPromises)

  const joinedCount = clients.filter((c) => c.joined).length
  console.log(`[loadtest] ${joinedCount}/${N} clients in room. Starting traffic for ${DURATION_S}s...`)

  // Reset per-client stats now that we're past the join phase — we want
  // metrics about the steady-state, not connection setup.
  const startWall = Date.now()
  for (const c of clients) {
    if (!c.joined) continue
    c.snapshotCount = 0
    c.bytesIn = 0
    c.bytesOut = 0
    c.rtts = []
    c.snapshotGaps = []
    c.lastSnapshotAt = null
    c.startTraffic()
  }

  // Periodic progress so a long run isn't silent.
  const progressIv = setInterval(() => {
    const elapsed = ((Date.now() - startWall) / 1000).toFixed(1)
    const snapTotal = clients.reduce((a, c) => a + c.snapshotCount, 0)
    console.log(`[loadtest] t=${elapsed}s  total-snapshots=${snapTotal}`)
  }, 10000)

  await sleep(DURATION_S * 1000)
  clearInterval(progressIv)

  for (const c of clients) c.stopTraffic()
  const durationMs = Date.now() - startWall
  console.log('[loadtest] traffic stopped, closing sockets...')
  for (const c of clients) c.close()
  await sleep(500)

  console.log('\n' + summarize(clients, durationMs))
  process.exit(0)
}

main().catch((e) => {
  console.error('[loadtest] fatal:', e)
  process.exit(1)
})
