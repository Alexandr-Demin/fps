# Sector-17 Multiplayer

Networked combat: positions, shooting, HP/damage, kills, deaths and
respawns sync across clients. One global FFA room per server process,
soft-authoritative model (server trusts client-reported position and
client-reported hits — fine for friends-only tier).

The server process serves **both** the static client build and the
WebSocket on the same port, so a single URL is all a friend needs.

## Quickstart — dev (two processes, fast iteration)

```
npm install
npm run server:watch   # terminal 1 — http + ws on :2567
npm run dev            # terminal 2 — Vite on http://localhost:5173
```

Open `http://localhost:5173` in two browser tabs. In each:

1. Click **ARENA DUEL**
2. Pick a nickname (saved in `localStorage`)
3. **CONNECT** → mouse is captured, you see the other player as a blue
   capsule with nickname + HP bar
4. Shoot them. 3 body shots = kill. Headshots (top of capsule) = 2 to kill.

The Vite client auto-targets `ws://localhost:5173` for the WebSocket
(same-origin) — but Vite doesn't run the game server, so we redirect it
to `:2567` via `VITE_MP_SERVER`. Set this in `.env.local`:

```
VITE_MP_SERVER=ws://localhost:2567
```

Without `VITE_MP_SERVER`, the client tries to open a WS on the Vite
port and fails immediately.

Controls in match:
- **ESC** opens the MP pause menu (RESUME / SETTINGS / MAIN MENU).
- **ALT** releases the cursor without pausing — useful for tab switching.
- Click the canvas to re-capture the cursor.

## Quickstart — prod (one process, one URL)

```
npm install
npm run start          # builds client and serves http+ws on :2567
```

Open `http://localhost:2567` — the page is served from `dist/`, and the
WebSocket connects back to `ws://localhost:2567` automatically. No port
field to configure, no second process.

This is the path you want for sharing a link with friends.

## LAN (host + friends on same Wi-Fi)

1. On the host, find the LAN IP:
   - Windows: `ipconfig` → look for the IPv4 of your active adapter (e.g. `192.168.1.42`)
   - macOS: `ipconfig getifaddr en0`
2. `npm run start` on the host.
3. On the **first run of `node.exe`**, Windows will pop up a firewall prompt.
   Allow access on **Private networks** (Public is optional/dangerous).
4. Every client opens `http://192.168.1.42:2567`. No further config — the
   client auto-targets the same origin for WS.

## Tailscale (friends across the internet, no port-forwarding)

[Tailscale](https://tailscale.com/) gives every device a private IP in your
personal tailnet, so it works as if everyone's on the same LAN.

1. Install Tailscale on the host and on every client; sign into the same account.
2. Find the host's Tailscale IP (e.g. `100.x.y.z`) from the Tailscale tray icon
   or `tailscale ip -4`.
3. `npm run start` on the host.
4. Clients open `http://100.x.y.z:2567`.
5. Keep the host machine awake (disable sleep) during play.

No port-forwarding, no DDNS, no TLS cert.

## Environment

### Server (shell vars; no `.env` auto-load)

| Var          | Default    | Notes |
|--------------|------------|-------|
| `PORT`       | `2567`     | HTTP + WebSocket port (same port) |
| `TICK_RATE`  | `30`       | Snapshots per second |
| `MAX_PLAYERS`| `14`       | Hard cap; 15th connection is rejected with `room full` |
| `MAP_ID`     | `sector17` | One of: `sector17`, `tactical_arena`, `aim_duel` |

`aim_duel` is the recommended map for 2-player matches — small symmetric
arena (24×30m), 4 corner spawns, two central pillars, fast TTK.

Windows PowerShell example:

```
$env:MAP_ID = "aim_duel"; npm run start
```

### Client

| Var                | Default                 | Notes |
|--------------------|-------------------------|-------|
| `VITE_MP_SERVER`   | `ws(s)://<same-origin>` | Override the auto-derived same-origin WS URL — only useful in dev when the client (Vite :5173) and server (:2567) run on different ports. |

Put in `.env.local`:

```
VITE_MP_SERVER=ws://localhost:2567
```

## Known limitations

- **Soft-authoritative.** Server trusts client-reported positions (no
  validation) and client-reported hits (damage clamped to ≤200 as a
  sanity bound). Cheating is trivial — fine for friends-only matches.
- **No prediction/reconciliation.** Local player is authoritative for
  itself; remote players are interpolated from raw server snapshots
  (~30Hz, 30–100ms behind).
- **No lag compensation.** Hits resolved on shooter's machine against
  the latest remote position — fast strafing players will eat phantom
  shots at higher ping.
- **No reconnect.** WebSocket drop → main menu with an error. Click
  ARENA DUEL again to retry.
- **No bots in MP.** Skipped on `mpPlaying`.
- **`ws://` only out of the box.** If you front the server with TLS
  (Cloudflare Tunnel, nginx, etc.) the client auto-upgrades to `wss://`
  because page protocol drives the WS protocol.
- **One global FFA room** per server process. No lobbies, no team play.
