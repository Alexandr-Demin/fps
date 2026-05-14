# Sector-17 — VPS deploy

One-shot bootstrap of a fresh Ubuntu 22.04 / 24.04 VPS into a running
Sector-17 multiplayer server, serving the SPA + WebSocket on a single
port (HTTP only, no TLS).

## Quickstart

On a fresh box (logged in as a non-root sudo user — e.g. `sector`):

```bash
curl -fsSL https://raw.githubusercontent.com/Alexandr-Demin/fps/main/infra/deploy.sh | bash
```

This installs Node 22, clones the repo to `~/fps`, builds the client,
installs a systemd unit, opens the firewall, and starts the service.

The default URL friends use is `http://<vps-ip>:2567`.

## What `deploy.sh` does

1. `apt update && apt upgrade`
2. Installs Node.js 22 LTS (NodeSource), git, ufw, build-essential
3. Clones (or `git pull`s) `https://github.com/Alexandr-Demin/fps.git`
   into `~/fps`
4. `npm install` in the root + `server/`
5. Installs `infra/sector17.service` as a systemd unit, rewriting
   `User=` and `WorkingDirectory=` to match the deploying user
6. Opens ports 22 (ssh) and 2567 (game) in ufw
7. `systemctl enable && start sector17`

The script is idempotent — rerun it any time to pick up a new commit.

## Updating after new commits

```bash
cd ~/fps && bash infra/deploy.sh
```

Or, if you only want to apply code changes without re-running the full
script:

```bash
cd ~/fps && git pull
sudo systemctl restart sector17
```

## Tunables

Set in `/etc/systemd/system/sector17.service`, under `[Service]`. After
editing: `sudo systemctl daemon-reload && sudo systemctl restart sector17`.

| Env var       | Default     | Purpose |
|---------------|-------------|---------|
| `PORT`        | `2567`      | HTTP + WS port (same port) |
| `TICK_RATE`   | `30`        | Server snapshot rate (Hz) |
| `MAX_PLAYERS` | `2`         | Per-room cap (raise for Arena once Phase 4 lands) |
| `MAP_ID`      | `aim_duel`  | One of: `sector17`, `tactical_arena`, `aim_duel` |
| `PERF_LOG`    | `0`         | `1` enables the tick-time perf logger (see `MULTIPLAYER.md`) |

## Operating

```bash
# Logs
journalctl -u sector17 -f                  # live tail
journalctl -u sector17 --since "10 min ago"

# Service
sudo systemctl status sector17
sudo systemctl restart sector17
sudo systemctl stop sector17
```

## Hardening (optional but recommended)

Disable password SSH and root login. On the VPS:

```bash
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Make sure your SSH key works before doing this — otherwise you lock
yourself out and have to use the provider's web console to recover.

## Adding HTTPS later

Out of scope for the initial deploy (we serve `http://<ip>:2567`
directly). When you want HTTPS without buying a domain, the cheapest
path is:

1. `sudo apt install -y nginx certbot python3-certbot-nginx`
2. `sudo certbot --nginx -d <ip-with-dashes>.sslip.io`
3. Configure nginx as a reverse proxy for `http://localhost:2567`
   (WebSocket upgrade headers required).

`sslip.io` gives you wildcard DNS for any IP without registration,
which is enough for Let's Encrypt to issue a real cert.

## Rolling back to Tailscale Funnel

Keep the old deployment up while testing the VPS — friends can use
either URL. Once the VPS feels right and stays healthy for a few play
sessions, shut down the Funnel-fronted process.
