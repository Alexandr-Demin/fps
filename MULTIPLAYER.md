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
3. **CONNECT** → you land in the lobby
4. First tab: **CREATE DUEL** → you're in a fresh room, alone
5. Second tab: the room appears in the lobby as `alice's duel · 1/2 ·
   WAITING` — click it → both players are in the room
6. Shoot. 3 body shots = kill. Headshots (top of capsule) = 2 to kill.

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

## Public URL via Cloudflare Tunnel (free, stable, TLS)

The same-origin server is built to sit behind a tunnel. With Cloudflare's
named tunnel + a free `is-a.dev` subdomain you can hand friends a single
`https://arena.<you>.is-a.dev` URL — no port, no IP, no client config.

### What you need

- A free [Cloudflare](https://www.cloudflare.com/) account.
- `cloudflared` installed on the same machine that runs the game server
  ([Cloudflare's install docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
- A GitHub account (for the `is-a.dev` PR).

You do **not** need to own a domain or pay anything.

### One-time setup

1. **Authenticate cloudflared with your Cloudflare account.** Browser
   pops open once.

   ```
   cloudflared tunnel login
   ```

   Writes `~/.cloudflared/cert.pem`.

2. **Create the tunnel.** Pick any name — `sector17` is fine.

   ```
   cloudflared tunnel create sector17
   ```

   Note the printed **tunnel id** (uuid). Credentials JSON lands at
   `~/.cloudflared/<tunnel-id>.json`.

3. **Claim a free subdomain on `is-a.dev`** (or `js.org` / `eu.org` /
   `afraid.org` — any provider that lets you set a CNAME). The
   `is-a.dev` flow:

   - Fork [github.com/is-a-dev/register](https://github.com/is-a-dev/register).
   - Add `domains/arena-<your-handle>.json`:

     ```json
     {
       "owner": {
         "username": "<your-github-handle>",
         "email": "<you@example.com>"
       },
       "record": {
         "CNAME": "<tunnel-id>.cfargotunnel.com"
       }
     }
     ```

     `<tunnel-id>` is the uuid from step 2.

   - Open a PR. Approval typically takes 1–3 days. Once merged your
     subdomain `arena-<handle>.is-a.dev` is live and points at the
     tunnel.

4. **Configure cloudflared.** Copy the template and fill it in:

   ```
   cp infra/cloudflared.example.yml infra/cloudflared.yml
   # then edit: tunnel id, credentials-file path, hostname
   ```

   The real `cloudflared.yml` is gitignored — it embeds your tunnel id
   path to credentials, treat it like a secret.

### Daily run

```
cloudflared tunnel --config infra/cloudflared.yml run    # terminal 1
npm run start                                            # terminal 2
```

Open `https://arena-<handle>.is-a.dev/` in any browser — Cloudflare
terminates TLS, the WebSocket upgrades to `wss://` on the same origin,
and the game just works. Friends use the same URL.

### Quick tunnel (zero setup, throwaway URL)

For ad-hoc sessions without DNS or PR work:

```
cloudflared tunnel --url http://localhost:2567
```

Prints a random `https://*.trycloudflare.com` URL each run. No
authentication, no stability — fine for "let's play once tonight."

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
| `MAX_PLAYERS`| `2`        | Per-room cap (defaults to the protocol's `MAX_PLAYERS_PER_ROOM`). 3rd connection to a full room is rejected with `room full` and the lobby push refreshes. |
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
- **No private rooms / invite codes.** All rooms are open and visible in
  the lobby; anyone with the page URL can join any waiting room. Fine
  for the friends-only tier.
- **No team play.** Each room is FFA (effectively 1v1 with the default
  `MAX_PLAYERS=2`).
