#!/bin/bash
# blog-autopilot runner — SKELETON, next step (not yet tested end-to-end).
# Adapted from r7k12's run.sh to this stack: deploy is git push → GitHub Actions
# → GHCR image → VPS pull, not rsync. The independent HTTP check is the ONLY
# source of truth for "published".
#
#   DRY=1   ./run.sh   # build the prompt, touch nothing else
#   FORCE=1 ./run.sh   # ignore the "already published today" guard
set -uo pipefail

# --- config (fill these on the VPS) -----------------------------------------
DIR="$(cd "$(dirname "$0")" && pwd)"       # blog-autopilot/
REPO="$(cd "$DIR/.." && pwd)"              # repo root (deploy checkout)
DOMAIN="https://www.aigenway.com"
BRANCH="main"                              # push target that triggers the GHCR build
VERIFY_TIMEOUT=900                         # s to wait for Actions build + VPS pull
VERIFY_INTERVAL=30
# export CLAUDE_CODE_OAUTH_TOKEN=...       # subscription OAuth token for `claude -p`
# alert() { curl ... telegram ... "$1"; } # wire your alert channel

alert() { echo "[alert] $*"; }             # placeholder

DATE="$(TZ=Europe/Kyiv date +%F)"
OUT="$DIR/daily/$DATE"; mkdir -p "$OUT" "$DIR/state"

# One run at a time; skip if today already succeeded (retries are safe).
exec 9>"/tmp/blog-autopilot.lock"; flock -n 9 || exit 0
if [ "$(cat "$DIR/state/last-success.date" 2>/dev/null)" = "$DATE" ] && [ -z "${FORCE:-}" ]; then
  exit 0
fi

# 1. Pick a topic.
TOPIC="$(node "$DIR/queue.mjs" next)"
if [ -z "$TOPIC" ]; then alert "blog-autopilot: queue empty"; exit 0; fi
echo "$TOPIC" > "$OUT/topic.json"
SLUG="$(node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.parse(d).slug))' < "$OUT/topic.json")"

# 2. Build the prompt.
PROMPT="$(sed \
  -e "s|__DATE__|$DATE|g" \
  -e "s|__OUT__|$OUT|g" \
  -e "s|__REPO__|$REPO|g" \
  "$DIR/prompt.tmpl")"
# Splice the topic JSON in place of the __TOPIC__ marker.
PROMPT="${PROMPT/__TOPIC__/$TOPIC}"

if [ -n "${DRY:-}" ]; then echo "$PROMPT" > "$OUT/prompt.txt"; echo "DRY: wrote $OUT/prompt.txt"; exit 0; fi

# 3. Fresh main, then let the agent write the post.
git -C "$REPO" pull --ff-only origin "$BRANCH" >> "$OUT/run.log" 2>&1
cd "$REPO" || exit 1
timeout 2400 claude -p "$PROMPT" --dangerously-skip-permissions > "$OUT/claude.log" 2>&1

# 4. Trust but verify: the runner itself re-runs the gate.
if ! pnpm check:blog >> "$OUT/run.log" 2>&1; then
  alert "blog-autopilot: gate failed for $SLUG (see $OUT/run.log)"
  node "$DIR/queue.mjs" mark "$SLUG" failed
  exit 1
fi

# 5. Deploy = commit + push to main (triggers GHCR build via Actions).
git -C "$REPO" add "apps/web/src/content/blog/$SLUG.mdx" "apps/web/src/content/blog/index.ts"
git -C "$REPO" commit -m "feat(blog): add $SLUG post (autopilot)" >> "$OUT/run.log" 2>&1
git -C "$REPO" push origin "HEAD:$BRANCH" >> "$OUT/run.log" 2>&1 || { alert "blog-autopilot: push failed for $SLUG"; node "$DIR/queue.mjs" mark "$SLUG" failed; exit 1; }

# 6. Independent live check — the ONLY source of truth. Poll until the new image
#    is deployed (Actions build + VPS pull) or the timeout hits.
URL="$DOMAIN/blog/$SLUG"
deadline=$(( $(date +%s) + VERIFY_TIMEOUT ))
ok=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  html="$(curl -fsSL "$URL" 2>/dev/null)" || { sleep "$VERIFY_INTERVAL"; continue; }
  h2s="$(printf '%s' "$html" | grep -o '<h2' | wc -l | tr -d ' ')"
  if [ "$h2s" -ge 4 ]; then ok=1; break; fi
  sleep "$VERIFY_INTERVAL"
done

if [ "$ok" = 1 ]; then
  node "$DIR/queue.mjs" mark "$SLUG" published
  echo "$DATE" > "$DIR/state/last-success.date"
  alert "blog-autopilot ✓ published $URL"
else
  # Pushed but never went live within the window → failed (anti-dupe), and flag
  # for a human: the commit is on main, so don't rewrite the same keyword blind.
  node "$DIR/queue.mjs" mark "$SLUG" failed
  alert "blog-autopilot ⚠ $SLUG pushed but not live after ${VERIFY_TIMEOUT}s — check Actions/GHCR"
fi
