import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { stat, readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { Lobby } from './Lobby.js'
import { type MapData } from '../../shared/src/protocol.js'

const PORT = Number(process.env.PORT ?? 2567)
const TICK_RATE = Number(process.env.TICK_RATE ?? 30)
// Optional per-room cap override. When unset, room cap comes from the
// per-mode config in server/src/modes.ts (duel=2, arena=16). Set MAX_PLAYERS
// only to force the load-test harness past those caps when measuring
// capacity ceilings.
const MAX_PLAYERS_RAW = process.env.MAX_PLAYERS
const MAX_PLAYERS_OVERRIDE =
  MAX_PLAYERS_RAW != null && MAX_PLAYERS_RAW !== ''
    ? Number(MAX_PLAYERS_RAW)
    : null
// Number of waypoint-AI bots to spawn into the arena singleton on its
// first creation. 0 keeps the room human-only (production default).
// Range 0–8.
const BOT_COUNT = Math.max(0, Math.min(8, Number(process.env.BOT_COUNT ?? 0)))
const MAP_ID = process.env.MAP_ID ?? 'sector17'

const MAP_LOADERS: Record<string, () => Promise<MapData>> = {
  sector17:       async () => (await import('../../src/core/maps/sector17')).SECTOR_17,
  tactical_arena: async () => (await import('../../src/core/maps/tactical_arena')).TACTICAL_ARENA,
  aim_duel:       async () => (await import('../../src/core/maps/aim_duel')).AIM_DUEL,
}

// Resolve dist/ relative to the project root (server/src/index.ts lives at
// <root>/server/src/, so the project root is two levels up).
const DIST_DIR = resolve(fileURLToPath(new URL('../../dist', import.meta.url)))

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
}

async function tryServeFile(absPath: string, res: ServerResponse): Promise<boolean> {
  try {
    const s = await stat(absPath)
    if (!s.isFile()) return false
    const ext = extname(absPath).toLowerCase()
    const type = MIME[ext] ?? 'application/octet-stream'
    const body = await readFile(absPath)
    res.writeHead(200, { 'content-type': type, 'content-length': body.byteLength })
    res.end(body)
    return true
  } catch {
    return false
  }
}

let distMissingLogged = false

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain' }).end('method not allowed')
    return
  }

  // Strip query / hash, normalise, and reject any path traversal attempts.
  const urlPath = (req.url ?? '/').split('?')[0].split('#')[0]
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '')
  if (safe.includes('..')) {
    res.writeHead(403).end('forbidden')
    return
  }

  // 1) Try the literal file inside dist/
  const literal = join(DIST_DIR, safe || 'index.html')
  if (await tryServeFile(literal, res)) return

  // 2) SPA fallback — for non-asset paths, serve index.html so client-side
  //    routing (if any future PR adds it) still works. Asset 404s stay 404
  //    so missing chunks are obvious.
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(safe)
  if (!looksLikeAsset) {
    const indexPath = join(DIST_DIR, 'index.html')
    if (await tryServeFile(indexPath, res)) return
  }

  // 3) dist/ missing — show a friendly hint instead of a bare 404. This is
  //    the common "ran the server without building first" case in dev.
  if (!distMissingLogged) {
    distMissingLogged = true
    console.warn(
      `[server] dist/ not found at ${DIST_DIR}. Static serving disabled. ` +
      `Run "npm run build" (or use Vite on :5173 for dev).`
    )
  }
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(
    '<!doctype html><meta charset="utf-8"><title>Sector-17 server</title>' +
    '<body style="font:14px system-ui;margin:40px;color:#ddd;background:#111">' +
    '<h1>Sector-17 server</h1>' +
    '<p>WebSocket endpoint is live on this port.</p>' +
    '<p>No <code>dist/</code> build found — run <code>npm run build</code> on the host ' +
    'or open the Vite dev URL (default <code>http://localhost:5173</code>).</p>' +
    '</body>'
  )
}

async function main() {
  const loader = MAP_LOADERS[MAP_ID]
  if (!loader) {
    console.error(
      `[server] unknown MAP_ID=${MAP_ID}. Known: ${Object.keys(MAP_LOADERS).join(', ')}`
    )
    process.exit(1)
  }

  const mapData = await loader()
  const lobby = new Lobby(mapData, MAX_PLAYERS_OVERRIDE, BOT_COUNT)

  const httpServer = createServer((req, res) => {
    handleHttp(req, res).catch((e) => {
      console.error('[server] http handler error:', e)
      if (!res.headersSent) res.writeHead(500).end('internal error')
    })
  })

  // Attach WS to the same HTTP server so http(s)://host:PORT serves the
  // client and ws(s)://host:PORT/ accepts the WebSocket upgrade.
  const wss = new WebSocketServer({ server: httpServer })
  wss.on('connection', (ws) => lobby.onConnection(ws))
  wss.on('error', (err) => console.error('[server] wss error:', err))

  // Tick-time perf logger — opt-in diagnostic for tracking down freezes.
  // When PERF_LOG=1 the server emits a warn line for any tick over
  // SLOW_TICK_MS plus a sliding-window summary every PERF_WINDOW_MS. Off
  // by default so the prod console stays quiet; flip on for a session
  // when investigating lag reports. See MULTIPLAYER.md → Load testing.
  const PERF_LOG = process.env.PERF_LOG === '1'
  const SLOW_TICK_MS = Number(process.env.SLOW_TICK_MS ?? 50)
  const PERF_WINDOW_MS = Number(process.env.PERF_WINDOW_MS ?? 10_000)
  const tickSamples: number[] = []
  let windowStart = Date.now()

  function flushPerfWindow() {
    if (tickSamples.length === 0) return
    const sorted = [...tickSamples].sort((a, b) => a - b)
    const n = sorted.length
    const q = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))]
    const mean = sorted.reduce((a, b) => a + b, 0) / n
    const { rooms, players, connections } = lobby.stats()
    console.log(
      `[perf] window=${((Date.now() - windowStart) / 1000).toFixed(1)}s ` +
      `ticks=${n} conns=${connections} rooms=${rooms} players=${players}  ` +
      `tick(ms): mean=${mean.toFixed(1)} p50=${q(0.5).toFixed(1)} ` +
      `p95=${q(0.95).toFixed(1)} p99=${q(0.99).toFixed(1)} ` +
      `max=${sorted[n - 1].toFixed(1)}`
    )
    tickSamples.length = 0
    windowStart = Date.now()
  }

  const interval = setInterval(() => {
    const t0 = performance.now()
    try {
      lobby.tick()
    } catch (e) {
      console.error('[server] tick threw:', e)
    }
    const dt = performance.now() - t0
    if (PERF_LOG) {
      tickSamples.push(dt)
      if (dt > SLOW_TICK_MS) {
        const { players, rooms } = lobby.stats()
        console.warn(
          `[perf] SLOW tick: ${dt.toFixed(1)}ms (rooms=${rooms} players=${players})`
        )
      }
      if (Date.now() - windowStart >= PERF_WINDOW_MS) flushPerfWindow()
    }
  }, 1000 / TICK_RATE)

  httpServer.listen(PORT, () => {
    const cap =
      MAX_PLAYERS_OVERRIDE != null
        ? `maxPerRoom=${MAX_PLAYERS_OVERRIDE} (override)`
        : `maxPerRoom=per-mode (duel=2, arena=16)`
    console.log(
      `[server] listening on ${PORT} — http + ws on same port, ` +
      `map=${MAP_ID}, tick=${TICK_RATE}Hz, ${cap}, bots=${BOT_COUNT}, ` +
      `perfLog=${PERF_LOG ? 'on' : 'off'} (slow>${SLOW_TICK_MS}ms)`
    )
  })

  const shutdown = () => {
    console.log('[server] shutting down...')
    clearInterval(interval)
    wss.close()
    httpServer.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error('[server] fatal:', e)
  process.exit(1)
})
