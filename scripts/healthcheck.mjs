import WebSocket from 'ws'

// Liveness probe for the multiplayer server. Verifies the WS upgrade
// works (which is what we actually need to confirm a Tailscale Funnel /
// Cloudflare Tunnel front-end is forwarding correctly) and that the
// server is on the expected protocol version.
//
// Stops at the lobby step — ping/pong is in-room only.

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:2567'
// First connection through Tailscale Funnel / Cloudflare Tunnel can be
// cold (TLS + proxy warm-up). 15s default is forgiving; override via
// WS_TIMEOUT_MS for stricter checks in CI.
const TIMEOUT_MS = Number(process.env.WS_TIMEOUT_MS ?? 15000)
const PROTOCOL_VERSION = 8

const result = {
  url: URL,
  connected: false,
  welcomed: false,
  rejected: null,
  you: null,
  roomCount: null,
  error: null,
}

const ws = new WebSocket(URL)
const deadline = setTimeout(() => {
  result.error = 'timeout'
  finish(1)
}, TIMEOUT_MS)

function finish(code) {
  clearTimeout(deadline)
  try { ws.close() } catch {}
  console.log(JSON.stringify(result, null, 2))
  process.exit(code)
}

ws.on('open', () => {
  result.connected = true
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, nickname: 'healthcheck' }))
})

ws.on('message', (data) => {
  let msg
  try { msg = JSON.parse(data.toString()) } catch { return }
  if (msg.t === 'lobbyWelcome') {
    result.welcomed = true
    result.you = msg.you
    result.roomCount = Array.isArray(msg.rooms) ? msg.rooms.length : null
    finish(0)
  } else if (msg.t === 'reject') {
    result.rejected = msg.reason
    finish(2)
  }
})

ws.on('error', (e) => {
  result.error = e.message
  finish(1)
})
