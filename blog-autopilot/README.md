# blog-autopilot

Daily, hands-off SEO articles for low-frequency keywords that close on the
aigenway API — adapted from the r7k12 "статейник-автопилот" playbook to this
stack (Next.js + MDX, not a Python рушій).

## Two shears

| Shear | What | Where |
|-------|------|-------|
| **A. Рушій** | The blog itself. Article = `.mdx` + registry entry, quality enforced by a machine gate. | this repo (`apps/web/...`), already built |
| **B. Runner** | Picks a topic → headless `claude -p` writes the post into the рушій → gate → deploy → independent HTTP check → alert. | VPS cron (`run.sh`) — **next step, not yet wired** |

The рушій knows nothing about the runner; you can author by hand and the gate
still guards you.

## Flow

```
queue.json (topic)
  → prompt.tmpl (canon + topic + date)
  → headless claude -p   writes <slug>.mdx + registers in index.ts
  → pnpm check:blog      (runner re-runs it — never trusts the agent's word)
  → git commit + push to main
  → GitHub Actions builds the web image → GHCR → VPS pulls & restarts
  → curl https://www.aigenway.com/blog/<slug>  (200 + body + ≥4 <h2>)
     ├ ok  → queue mark published + alert ✓
     └ no  → queue mark failed    + alert ⚠   (anti-dupe: keyword won't retry blind)
```

**Deploy is via GHCR (GitHub Actions), not a build on the prod box.** A push to
`main` triggers the image build; the VPS pulls the new `web` image. That means
the live check must poll with a generous timeout (Actions build + pull is minutes,
not the seconds an rsync took in r7k12).

## The рушій side (this repo — done)

- **Canon**: [CANON.md](./CANON.md) — the article spec.
- **Machine gate**: `apps/web/scripts/validate-blog.mjs`, run via `pnpm check:blog`.
  Wired into `check:push` (husky pre-push), so a canon-breaking post cannot be
  pushed. Checks: required frontmatter, title/description length, ≥4 unique H2,
  a code block, an inline `<SignupCTA>`, ≥2 valid internal `relatedDocs`, and —
  critically — that every `.mdx` is registered in `index.ts` and vice versa.
- **Queue**: [queue.json](./queue.json) + [queue.mjs](./queue.mjs) (`next` / `mark` / `stats` / `add`).
- **Prompt**: [prompt.tmpl](./prompt.tmpl) — headless agent instructions.

Covers: **not needed** — the blog auto-generates a branded OG card per post from
`title` + `primaryKeyword` (`[slug]/opengraph-image.tsx`), and there is no hero
image slot. Set `ogImage` in frontmatter only for a custom card.

## Try the рушій by hand (no VPS)

```bash
node blog-autopilot/queue.mjs next          # see the next topic
# ...write apps/web/src/content/blog/<slug>.mdx + register in index.ts...
pnpm check:blog                             # must be green
node blog-autopilot/queue.mjs mark <slug> published
```

## The runner (Shear B) — built

`run.sh` is the full runner, tailored to the Hetzner prod box (repo at
`/opt/aiagregator`, github push via the `github_aiagg` key, deploy = local web
image rebuild since the GHCR pipeline isn't built). Flow: fetch/ff → `claude -p`
writes the post → **runner re-runs the gate** → commit+push `main` → rebuild &
restart web → independent HTTP check → mark published/failed.

### Turning it on

The box starts bare (no node / pnpm / `claude` CLI). One-time provisioning:

```bash
# on the box, as root
bash /opt/aiagregator/blog-autopilot/provision-box.sh
```

That installs Node, pnpm + repo deps, and the `claude` CLI. Two manual steps
remain (the script prints them):

1. **OAuth token** — the one thing only the operator can do. `claude setup-token`
   locally, then drop it in `/root/.config/blog-autopilot/oauth.token` (mode 600).
   `run.sh` reads it into `CLAUDE_CODE_OAUTH_TOKEN`.
2. **Smoke-test + cron** — `DRY=1 ./run.sh`, then `FORCE=1 ./run.sh` under watch,
   verify the live post, then add one daily crontab slot.

Optional: set `ALERT_WEBHOOK` (a URL taking `?text=`) for per-run pings; otherwise
runs just log to `daily/<date>/run.log`.

### Deploy note

Today the runner rebuilds the `web` image on the box each run (~1–2 min). If/when
the GHCR pipeline lands, swap step 7 of `run.sh` for an image pull.
