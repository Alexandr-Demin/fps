#!/usr/bin/env bash
set -euo pipefail

# Sector-17 — first-time VPS bootstrap. Idempotent: re-running it on an
# already-deployed box is safe and brings it up to date.
#
# Usage (as a non-root sudo-capable user on a fresh Ubuntu 22.04/24.04 box):
#   curl -fsSL https://raw.githubusercontent.com/Alexandr-Demin/fps/main/infra/deploy.sh | bash
# Or, after cloning the repo:
#   cd ~/fps && bash infra/deploy.sh
#
# What it does:
#   1. apt update / upgrade
#   2. install Node 22 LTS + git + ufw
#   3. clone (or update) the repo to ~/fps
#   4. install client + server deps
#   5. install + enable the systemd unit (infra/sector17.service)
#   6. open ports 22 + 2567 in ufw
#   7. start the service and show its status
#
# Tunables read from the environment (override before invoking):
#   REPO_URL    git remote                    default = the canonical repo
#   REPO_DIR    where to clone                default = $HOME/fps
#   BRANCH      branch to track               default = main

REPO_URL="${REPO_URL:-https://github.com/Alexandr-Demin/fps.git}"
REPO_DIR="${REPO_DIR:-$HOME/fps}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="sector17"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }

if [[ $EUID -eq 0 ]]; then
  warn "running as root — strongly recommended to run as an unprivileged sudo user instead."
  warn "create one: adduser sector && usermod -aG sudo sector && su - sector"
  warn "continuing in 5s... Ctrl+C to abort"
  sleep 5
fi

# -------------------------------------------------------------------- 1
say "apt update + upgrade"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# -------------------------------------------------------------------- 2
say "install base packages (curl, git, ufw, build-essential)"
sudo apt-get install -y curl git ufw build-essential ca-certificates

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -qE '^v(22|23|24)\.'; then
  say "install Node.js 22 LTS via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
say "node $(node --version), npm $(npm --version)"

# -------------------------------------------------------------------- 3
if [[ -d "$REPO_DIR/.git" ]]; then
  say "repo already cloned at $REPO_DIR — pulling latest $BRANCH"
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
else
  say "cloning $REPO_URL into $REPO_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

# -------------------------------------------------------------------- 4
say "npm install (client root)"
( cd "$REPO_DIR" && npm ci --no-audit --no-fund || npm install --no-audit --no-fund )

say "npm install (server/)"
( cd "$REPO_DIR/server" && npm ci --no-audit --no-fund || npm install --no-audit --no-fund )

# -------------------------------------------------------------------- 5
say "install systemd unit $SERVICE_NAME.service"
# The unit ships with User=sector / WorkingDirectory=/home/sector/fps —
# rewrite both to whatever account is running this script, so the deploy
# works regardless of the chosen username.
TMP_UNIT="$(mktemp)"
sed \
  -e "s|^User=.*|User=$USER|" \
  -e "s|^Group=.*|Group=$USER|" \
  -e "s|^WorkingDirectory=.*|WorkingDirectory=$REPO_DIR|" \
  "$REPO_DIR/infra/sector17.service" > "$TMP_UNIT"

sudo install -m 0644 "$TMP_UNIT" "/etc/systemd/system/$SERVICE_NAME.service"
rm -f "$TMP_UNIT"
sudo systemctl daemon-reload

# -------------------------------------------------------------------- 6
say "open firewall (ssh + game port)"
sudo ufw allow 22/tcp || true
sudo ufw allow 2567/tcp || true
sudo ufw --force enable || true
sudo ufw status

# -------------------------------------------------------------------- 7
say "enable + start $SERVICE_NAME"
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

sleep 2
say "status:"
sudo systemctl --no-pager status "$SERVICE_NAME" || true

cat <<EOF

  ===========================================================================
  Sector-17 deployed.

  Live logs:
      journalctl -u $SERVICE_NAME -f

  Health check (from anywhere with network access to this VPS):
      curl -sS http://<this-vps-ip>:2567/    # should serve the SPA index

  WS probe (locally):
      WS_URL=ws://127.0.0.1:2567 node $REPO_DIR/scripts/healthcheck.mjs

  Update flow (when new code lands on $BRANCH):
      cd $REPO_DIR && git pull && bash infra/deploy.sh

  Per-room cap and other knobs live in /etc/systemd/system/$SERVICE_NAME.service
  (Environment= lines). Change there + 'sudo systemctl restart $SERVICE_NAME'.
  ===========================================================================
EOF
