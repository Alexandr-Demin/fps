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

## Public URL — share a link, friends just open it

Three paths, none require port-forwarding or a router config. All give
real HTTPS so the WebSocket auto-upgrades to `wss://` on the same origin.

### Quick Cloudflare Tunnel (recommended for casual play)

Zero signup, instant. URL is random per `cloudflared` run and lives until
you stop the process.

```
cloudflared tunnel --url http://localhost:2567    # terminal 1
npm run start                                     # terminal 2
```

`cloudflared` prints `https://<random>.trycloudflare.com` — that's your
shareable URL. Reboot or Ctrl+C → next start yields a different URL.

Install once: Windows `winget install Cloudflare.cloudflared`, macOS
`brew install cloudflare/cloudflare/cloudflared`, Linux — see
[Cloudflare's downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

### Tailscale Funnel (free, permanent URL, no domain needed)

Permanent public hostname of the form `<machine>.<tailnet>.ts.net`. Free
Personal plan, no card, URL survives reboots.

1. Install [Tailscale](https://tailscale.com/download) on the host, sign
   in (Google/GitHub), `tailscale up`.
2. Enable Funnel for the game port:

   ```
   tailscale funnel --bg http://localhost:2567
   ```

   (older CLI: `tailscale serve --bg --https=443 http://localhost:2567`
   then `tailscale funnel 443 on`). Tailscale prints the public URL.

3. `npm run start` as usual. Friends open the printed URL — they do
   **not** need Tailscale.

Friends without Tailscale still reach you via Funnel. Bandwidth is more
than enough for 1v1 duels; not built for tournaments.

### Named Cloudflare Tunnel with your own domain

If you own (or pick up cheaply) a domain added to your Cloudflare zone,
you get a stable branded URL like `https://arena.yourdomain.com/`. The
config template lives in `infra/cloudflared.example.yml`.

```
cloudflared tunnel login                                     # once → ~/.cloudflared/cert.pem
cloudflared tunnel create sector17                           # once → prints tunnel id
cloudflared tunnel route dns sector17 arena.yourdomain.com   # once → wires DNS in your zone
cp infra/cloudflared.example.yml infra/cloudflared.yml       # once → fill in tunnel id, creds path, hostname (gitignored)
cloudflared tunnel --config infra/cloudflared.yml run        # daily — terminal 1
npm run start                                                # daily — terminal 2
```

### Why not is-a.dev / js.org / free subdomain providers

Tempting (free permanent subdomain pointing at a Cloudflare tunnel) but
**doesn't work in practice**:

- **is-a.dev** explicitly denylists `*.cfargotunnel.com` CNAMEs in their
  PR validator (`util/disallowed-cnames.json` in `is-a-dev/register`).
  Their CI auto-closes such PRs and the repo's README warns about
  blocking accounts that submit invalid PRs.
- **js.org** requires a real software project page (static, not a
  game server).
- **eu.org** accepts the CNAME but review takes weeks and is manual.
- **afraid.org** works but the `*.mooo.com`-style hostnames have spam
  reputation in Telegram/Slack link previews.

If you want stable + free + no domain → use **Tailscale Funnel** above.
If you want stable + own branding → buy a $2/yr domain and use the named
tunnel path. Don't sink time into the free-subdomain rabbit hole.

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
