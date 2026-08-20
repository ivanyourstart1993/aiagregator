#!/bin/bash
# One-time provisioning of the Hetzner box to run blog-autopilot.
# Run as root ON THE BOX:  bash /opt/aiagregator/blog-autopilot/provision-box.sh
#
# Installs Node + pnpm + the `claude` CLI and the repo deps the canon gate needs.
# It does NOT install the OAuth token or enable cron — those are the two manual
# steps printed at the end (the token is a secret only you can mint).
set -euo pipefail
REPO=/opt/aiagregator

echo "== Node (repo engines: >=20) =="
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== pnpm (pinned to the repo's packageManager) =="
corepack enable || npm i -g corepack
# Match package.json "packageManager": pnpm@9.15.0 (node 20 compatible).
corepack prepare pnpm@9.15.0 --activate || npm i -g pnpm@9.15.0
pnpm -v

echo "== claude CLI =="
command -v claude >/dev/null || npm i -g @anthropic-ai/claude-code
claude --version

echo "== repo deps (so 'pnpm check:blog' runs) =="
cd "$REPO"
pnpm install --frozen-lockfile || pnpm install

echo "== cover-gen dep (sharp) for blog-autopilot =="
cd "$REPO/blog-autopilot"
npm install --no-audit --no-fund

echo "== token dir =="
install -d -m 700 /root/.config/blog-autopilot

cat <<'NEXT'

=========================================================================
 Provisioning done. TWO manual steps remain to turn the autopilot on:

 1) OAuth token for headless `claude -p` (only you can mint it):
      claude setup-token          # follow the browser flow, copy the token
    then store it on the box:
      umask 077; echo 'PASTE_TOKEN_HERE' > /root/.config/blog-autopilot/oauth.token

 2) Smoke-test, then enable cron:
      DRY=1   /opt/aiagregator/blog-autopilot/run.sh     # builds prompt only
      FORCE=1 /opt/aiagregator/blog-autopilot/run.sh     # full run, watch it
    verify the live post, then add ONE daily slot to root's crontab:
      # 06:20 Kyiv daily — write & ship one article
      20 6 * * *  /opt/aiagregator/blog-autopilot/run.sh >/dev/null 2>&1
    (optionally a retry slot a few hours later; run.sh self-skips if done)
=========================================================================
NEXT
