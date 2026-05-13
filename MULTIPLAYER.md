# Sector-17 Multiplayer · Phase 1

Phase 1 ships **movement-only** networking: positions and rotations sync
between players over a single global FFA room. No shooting/HP/respawn over
the wire yet — those stay solo-only for now.

## Quickstart (localhost)

```
npm install
npm run server:watch   # terminal 1 — server on ws://localhost:2567
npm run dev            # terminal 2 — Vite on http://localhost:5173
```

Open `http://localhost:5173` in two browser tabs (or windows). In each:

1. Click **DEATHMATCH**
2. Pick a nickname (saved in `localStorage`)
3. Leave `Server URL` as `ws://localhost:2567`
4. **CONNECT** → mouse is captured, you see the other player as a blue capsule

Press **ESC** to release the cursor; refresh the page to leave the match.

## LAN (host + friends on same Wi-Fi)

1. On the host, find the LAN IP:
   - Windows: `ipconfig` → look for the IPv4 of your active adapter (e.g. `192.168.1.42`)
   - macOS: `ipconfig getifaddr en0`
2. Start the server on the host (`npm run server:watch`).
3. On the **first run of `node.exe`**, Windows will pop up a firewall prompt.
   Allow access on **Private networks** (Public is optional/dangerous).
4. On every client, open the host's Vite URL (e.g. `http://192.168.1.42:5173`)
   and in the multiplayer screen set `Server URL` to `ws://192.168.1.42:2567`.

## Tailscale (friends across the internet, no port-forwarding)

[Tailscale](https://tailscale.com/) gives every device a private IP in your
personal tailnet, so it works as if everyone's on the same LAN.

1. Install Tailscale on the host and on every client; sign into the same account.
2. Find the host's Tailscale IP (e.g. `100.x.y.z`) from the Tailscale tray icon
   or `tailscale ip -4`.
3. Run the server on the host as usual.
4. On clients, use `ws://100.x.y.z:2567` as Server URL.
5. Keep the host machine awake (disable sleep) during play.

No port-forwarding, no DDNS, no TLS cert.

## Environment

### Server (`server/.env.example` — copy and set values in your shell)

| Var          | Default    | Notes |
|--------------|------------|-------|
| `PORT`       | `2567`     | WebSocket port |
| `TICK_RATE`  | `30`       | Snapshots per second |
| `MAX_PLAYERS`| `14`       | Hard cap; 15th connection is rejected with `room full` |
| `MAP_ID`     | `sector17` | One of: `sector17`, `tactical_arena` |

Windows PowerShell example:

```
$env:MAP_ID = "tactical_arena"; npm run server
```

The server does **not** load a `.env` file automatically — set vars in the
shell before launching, or use `cross-env` in `package.json`.

### Client

| Var                | Default                | Notes |
|--------------------|------------------------|-------|
| `VITE_MP_SERVER`   | `ws://localhost:2567`  | Pre-fills the Server URL field |

Put in `.env.local`:

```
VITE_MP_SERVER=ws://192.168.1.42:2567
```

## Known limitations (Phase 1)

- **Movement only.** Shooting, HP, deaths, kill counters don't sync. They still
  work locally but are invisible to other players.
- **No prediction/reconciliation.** Your local player is fully authoritative
  for yourself; you simply see other players' raw server positions, lerped.
- **No pause in MP.** ESC only releases the pointer lock; the match continues.
- **No reconnect.** If the WebSocket drops, you go back to the main menu with
  an error toast. Click DEATHMATCH again to retry.
- **No bots in MP.** They're skipped on `mpPlaying`.
- **`ws://` only.** Open the client over `http://` — `https://` pages block
  insecure WebSockets ("mixed content").
- **One global FFA room** per server process. No lobbies, no team play.
- **Server has no Rapier.** It trusts client-reported positions. Cheating is
  trivial; this is intentional for Phase 1.
