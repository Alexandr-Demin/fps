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
| `PERF_LOG`     | `0`        | Set to `1` to enable the tick-time perf logger (see *Load testing & perf diagnostics*). Off in prod. |
| `SLOW_TICK_MS` | `50`       | Threshold for the per-event `SLOW tick` warn line. Only meaningful when `PERF_LOG=1`. |
| `PERF_WINDOW_MS` | `10000`  | Sliding-window size for the periodic `[perf] window=…` summary. Only meaningful when `PERF_LOG=1`. |

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

## Load testing & perf diagnostics

Two scripts under `scripts/` plus an opt-in server-side perf logger.
Together they answer "does this server hold N players in one room, and
when freezes happen, who's at fault — server CPU, the transport, or the
client?" Useful before lifting `MAX_PLAYERS`, before adding new
broadcast traffic, and when investigating lag reports.

### Healthcheck — is the WS endpoint alive?

```
node scripts/healthcheck.mjs                                  # localhost
WS_URL=wss://arena.example/ node scripts/healthcheck.mjs      # remote
```

Opens a single connection, sends `hello`, expects `lobbyWelcome` within
15s, prints a JSON status. Exit code 0 = healthy. Use this in CI or as
a uptime probe behind Tailscale Funnel / Cloudflare Tunnel.

### Load test — N synthetic clients into one room

```
WS_URL=wss://arena.example/ N=16 DURATION_S=60 node scripts/loadtest.mjs
```

Spawns N WebSocket clients, has one create a room and the rest join it,
then streams `input` at `INPUT_HZ` (default 30) and pings at `PING_HZ`
(default 1) for `DURATION_S` seconds. Prints a summary at the end:
joined count, per-client snapshot rate, RTT mean / p50 / p95 / p99 /
max, snapshot-gap distribution (catches server stalls), per-client
byte counts, and any failed clients.

Requires the server to be started with `MAX_PLAYERS=N` (or higher), or
the joiners after the second one are rejected with `room full`. After
the test, drop the env var and restart to return to the duel default.

Env knobs: `WS_URL`, `N`, `DURATION_S`, `INPUT_HZ`, `PING_HZ`,
`PROTOCOL_VER`, `NICK_PREFIX`, `STAGGER_MS`.

### Sweep — find the per-room capacity ceiling

For an `N`-sweep, restart the server with a generous cap and loop the
load test:

```
# on the server
MAX_PLAYERS=64 npm run start

# from any machine with network to the WS endpoint
for N in 4 8 12 16 20 24 32 48; do
  echo "=== N=$N ==="
  WS_URL=wss://arena.example/ N=$N DURATION_S=20 node scripts/loadtest.mjs
  sleep 5
done
```

Watch for the inflection where:
- `Snapshot rate per client` min drops noticeably below the mean (some
  clients are starving),
- `RTT p95` crosses ~500 ms,
- `Snapshot gap max` crosses ~1 s.

That `N` is the practical cap on the current transport. On a
Tailscale-Funnel-fronted deployment the typical knee is around 20
clients per room — outbound bandwidth, not server CPU, is the bottleneck.

### Live feel test — N-1 bots + you

When synthetic metrics look fine but players still report freezes, put
yourself in the room and confirm by eye:

```
# server: keep MAX_PLAYERS high enough to fit you + the bots
MAX_PLAYERS=64 npm run start

# your machine: spawn 15 bots, then open the game URL and JOIN 16th
WS_URL=wss://arena.example/ N=15 DURATION_S=600 NICK_PREFIX=BOT \
  node scripts/loadtest.mjs
```

The bots wander on random walks and stream the same input traffic a
real player would — broadcast load is identical to a real 16-player
match, except the bots don't shoot back.

### Server-side perf log

`PERF_LOG=1` enables a tick-time wrapper around `lobby.tick()`. Two
output forms:

```
# Per-event warn — emitted on any tick over SLOW_TICK_MS (default 50ms).
# These correspond 1:1 to visible player-side freezes if the server is at
# fault.
[perf] SLOW tick: 87.4ms (rooms=1 players=16)

# Sliding-window summary — emitted every PERF_WINDOW_MS (default 10s)
# whether anything is slow or not. Gives the steady-state distribution.
[perf] window=10.0s ticks=300 conns=17 rooms=1 players=16  tick(ms): mean=0.7 p50=0.6 p95=1.0 p99=1.4 max=1.7
```

```
PERF_LOG=1 MAX_PLAYERS=16 npm run start
```

For a 16-player room on commodity hardware the steady-state should sit
at `tick mean < 5ms`, `tick max < 20ms`. Tick budget at 30Hz is 33ms;
anything approaching that means real CPU pressure (not a transport
problem) and the optimisation path is binary protocol / lower tick
rate / native-WS replacement.

### Reading the combination

| Client freeze | `SLOW tick` warns | Where to look |
|---|---|---|
| Yes | Yes, same time | Server CPU — GC pause, slow serialization, or N too high for a single Node process. |
| Yes | No (tick max < 20ms) | Transport — TLS proxy buffering, ISP jitter, or client-side render-loop stall. Check the browser performance timeline next. |
| No | No | Healthy. |

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
- **Auto-reconnect on short drops.** When the WS unexpectedly closes
  during a match or lobby session, the client cycles through 5 attempts
  with exponential backoff (~15s total) before falling back to the main
  menu. The reconnect overlay holds the previous scene in place; on
  success the player is dropped back into their old room if it still
  exists, or into the lobby with a "previous room is no longer
  available" notice. Manual disconnect (BACK / MAIN MENU) suppresses
  the reconnect cycle — the user clearly wanted to leave.
- **No bots in MP.** Skipped on `mpPlaying`.
- **`ws://` only out of the box.** If you front the server with TLS
  (Cloudflare Tunnel, nginx, etc.) the client auto-upgrades to `wss://`
  because page protocol drives the WS protocol.
- **No private rooms / invite codes.** All rooms are open and visible in
  the lobby; anyone with the page URL can join any waiting room. Fine
  for the friends-only tier.
- **No team play.** Each room is FFA (effectively 1v1 with the default
  `MAX_PLAYERS=2`).
