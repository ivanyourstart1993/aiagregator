#!/bin/bash
# blog-autopilot runner — writes one SEO article/day and ships it, unattended.
#
# Host: the Hetzner prod box (repo at /opt/aiagregator, docker for deploy,
# github push via the github_aiagg key). Deploy is a local web-image rebuild
# (GHCR pipeline not built yet). The independent HTTP check is the ONLY source
# of truth for "published" — the runner never trusts the agent's word.
#
#   DRY=1   ./run.sh   # build the prompt, touch nothing else
#   FORCE=1 ./run.sh   # ignore the "already ran today" guard
#
# Prereqs on the box (see provision-box.sh): node, pnpm + `pnpm install`,
# `claude` CLI, and the OAuth token file below.
set -uo pipefail

# --- config -----------------------------------------------------------------
DIR="$(cd "$(dirname "$0")" && pwd)"          # blog-autopilot/
REPO="$(cd "$DIR/.." && pwd)"                 # /opt/aiagregator
DOMAIN="https://www.aigenway.com"
BRANCH="main"
COMPOSE="$REPO/infra/docker-compose.prod.yml"
ENVF="$REPO/infra/.env.prod"
TOKEN_FILE="${TOKEN_FILE:-/root/.config/blog-autopilot/oauth.token}"
GH_KEY="${GH_KEY:-/root/.ssh/github_aiagg}"
VERIFY_TIMEOUT=300
VERIFY_INTERVAL=15
export GIT_SSH_COMMAND="ssh -i $GH_KEY -o IdentitiesOnly=yes -o BatchMode=yes"
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.bun/bin:$PATH"

DATE="$(TZ=Europe/Kyiv date +%F)"
OUT="$DIR/daily/$DATE"; mkdir -p "$OUT" "$DIR/state"
LOG="$OUT/run.log"; exec > >(tee -a "$LOG") 2>&1
echo "=== blog-autopilot $DATE $(date -u +%H:%M:%SZ) ==="

# Alert hook: set ALERT_WEBHOOK (a URL that takes ?text=) to get pings; else log.
alert() { echo "[alert] $*"; [ -n "${ALERT_WEBHOOK:-}" ] && curl -fsS "${ALERT_WEBHOOK}$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$*" 2>/dev/null || echo)" >/dev/null 2>&1 || true; }
fail() { alert "⚠ $*"; [ -n "${SLUG:-}" ] && node "$DIR/queue.mjs" mark "$SLUG" failed || true; exit 1; }

# One run at a time; skip if today already succeeded (retries are safe).
exec 9>/tmp/blog-autopilot.lock; flock -n 9 || { echo "another run holds the lock"; exit 0; }
if [ "$(cat "$DIR/state/last-success.date" 2>/dev/null)" = "$DATE" ] && [ -z "${FORCE:-}" ]; then
  echo "already published today"; exit 0
fi

# 1. Pick a topic.
TOPIC="$(node "$DIR/queue.mjs" next)"
[ -z "$TOPIC" ] && { alert "queue empty — add topics to queue.json"; exit 0; }
echo "$TOPIC" > "$OUT/topic.json"
SLUG="$(node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.parse(d).slug))' < "$OUT/topic.json")"
echo "topic: $SLUG"

# 2. Build the prompt (splice topic JSON in place of the __TOPIC__ marker).
PROMPT="$(sed -e "s|__DATE__|$DATE|g" -e "s|__OUT__|$OUT|g" -e "s|__REPO__|$REPO|g" "$DIR/prompt.tmpl")"
PROMPT="${PROMPT/__TOPIC__/$TOPIC}"
if [ -n "${DRY:-}" ]; then echo "$PROMPT" > "$OUT/prompt.txt"; echo "DRY: wrote $OUT/prompt.txt"; exit 0; fi

# 3. Fresh main (fast-forward only; infra drift on Caddyfile/compose must not be
#    clobbered — abort if it can't ff cleanly).
git -C "$REPO" fetch origin -q || fail "git fetch failed"
git -C "$REPO" merge --ff-only "origin/$BRANCH" >>"$LOG" 2>&1 || fail "cannot fast-forward $BRANCH (local drift/divergence — resolve by hand)"

# 4. Let the agent write the post (all in one turn; writes result.json).
[ -f "$TOKEN_FILE" ] || fail "no OAuth token at $TOKEN_FILE"
export CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOKEN_FILE")"
cd "$REPO" || fail "cd repo"
timeout 2400 claude -p "$PROMPT" --dangerously-skip-permissions > "$OUT/claude.log" 2>&1 || echo "claude exited non-zero (continuing to gate check)"

# 5. Trust but verify: the runner re-runs the canon gate itself.
pnpm check:blog >>"$LOG" 2>&1 || fail "gate (check:blog) failed for $SLUG — see $LOG"
[ -f "$REPO/apps/web/src/content/blog/$SLUG.mdx" ] || fail "agent did not create $SLUG.mdx"
grep -q "'$SLUG'" "$REPO/apps/web/src/content/blog/index.ts" || fail "$SLUG not registered in index.ts"

# 6. Commit + push (only the two blog files — never the infra drift).
git -C "$REPO" add "apps/web/src/content/blog/$SLUG.mdx" "apps/web/src/content/blog/index.ts"
git -C "$REPO" commit -m "feat(blog): add $SLUG post (autopilot)" >>"$LOG" 2>&1 || fail "nothing to commit for $SLUG"
git -C "$REPO" push origin "HEAD:$BRANCH" >>"$LOG" 2>&1 || fail "push failed for $SLUG"

# 7. Deploy: rebuild the web image and restart web (blog content is baked in).
docker compose -f "$COMPOSE" --env-file "$ENVF" build web >>"$LOG" 2>&1 || fail "web build failed for $SLUG"
docker compose -f "$COMPOSE" --env-file "$ENVF" up -d web >>"$LOG" 2>&1 || fail "web up -d failed for $SLUG"

# 8. Independent live check — the ONLY source of truth. Poll until the new post
#    is served (200 + >=4 <h2>) or the timeout hits.
URL="$DOMAIN/blog/$SLUG"
deadline=$(( $(date +%s) + VERIFY_TIMEOUT )); ok=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  html="$(curl -fsSL "$URL" 2>/dev/null)" || { sleep "$VERIFY_INTERVAL"; continue; }
  [ "$(printf '%s' "$html" | grep -c '<h2')" -ge 4 ] && { ok=1; break; }
  sleep "$VERIFY_INTERVAL"
done

if [ "$ok" = 1 ]; then
  node "$DIR/queue.mjs" mark "$SLUG" published
  echo "$DATE" > "$DIR/state/last-success.date"
  alert "✓ published $URL"
else
  node "$DIR/queue.mjs" mark "$SLUG" failed
  alert "⚠ $SLUG pushed+built but not live after ${VERIFY_TIMEOUT}s — check $LOG"
fi
