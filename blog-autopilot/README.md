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

## Next step — wire the runner (Shear B)

`run.sh` is a documented skeleton, **not yet tested end-to-end**. To turn it on:

1. Put a deploy checkout of this repo on the VPS; give it a push credential that
   can push to `main` (or open a PR — see the deploy decision).
2. Set up the GHCR build workflow (`.github/workflows/deploy-web.yml`) so push →
   image → VPS pull.
3. Fill `run.sh`: `CLAUDE_CODE_OAUTH_TOKEN` source, `DOMAIN`, alert hook, verify
   timeout tuned to the Actions build time.
4. Test: `DRY=1 ./run.sh` → `FORCE=1 ./run.sh` under watch → verify the live post
   → only then add the cron slot.
