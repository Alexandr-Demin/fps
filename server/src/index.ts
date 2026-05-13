import { WebSocketServer } from 'ws'
import { Room } from './Room.js'
import type { MapData } from '../../shared/src/protocol.js'

const PORT = Number(process.env.PORT ?? 2567)
const TICK_RATE = Number(process.env.TICK_RATE ?? 30)
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 14)
const MAP_ID = process.env.MAP_ID ?? 'sector17'

const MAP_LOADERS: Record<string, () => Promise<MapData>> = {
  sector17:       async () => (await import('../../src/core/maps/sector17')).SECTOR_17,
  tactical_arena: async () => (await import('../../src/core/maps/tactical_arena')).TACTICAL_ARENA,
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
  const room = new Room(mapData, MAX_PLAYERS)
  const wss = new WebSocketServer({ port: PORT })

  wss.on('connection', (ws) => room.onConnection(ws))
  wss.on('error', (err) => console.error('[server] wss error:', err))

  const interval = setInterval(() => room.tick(), 1000 / TICK_RATE)

  console.log(
    `[server] listening on ${PORT}, map=${MAP_ID}, tick=${TICK_RATE}Hz, maxPlayers=${MAX_PLAYERS}`
  )

  const shutdown = () => {
    console.log('[server] shutting down...')
    clearInterval(interval)
    wss.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error('[server] fatal:', e)
  process.exit(1)
})
