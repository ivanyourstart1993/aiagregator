# Article canon — aigenway SEO blog

The spec an article must satisfy. The machine-checkable subset is enforced by
`apps/web/scripts/validate-blog.mjs` (`pnpm check:blog`, runs in the pre-push
gate). The rest is editorial guidance for whoever (human or autopilot) writes the
post. **If the gate is red, the article does not ship.**

## Format & location

- One post = `apps/web/src/content/blog/<slug>.mdx` — YAML frontmatter + MDX body.
- **Register it** in `apps/web/src/content/blog/index.ts`: `import x from './<slug>.mdx?raw'`
  and append `{ slug: '<slug>', raw: x }` to `rawPosts`. An unregistered file
  renders nowhere — the gate fails the build if a `.mdx` isn't registered.
- `slug` = filename stem = URL (`/blog/<slug>`). Kebab-case, matches the primary
  keyword (e.g. `seedance-api`).

## Frontmatter (required unless noted)

```yaml
title: "..."            # 30–62 chars ideal (hard cap 70). The SEO <title> + H1.
description: "..."       # 140–165 chars ideal (hard cap 110–200). The meta description.
date: "YYYY-MM-DD"       # publish date
updated: "YYYY-MM-DD"    # optional; defaults to date
tags: ["...", "..."]     # ≥1; the first is the topic cluster
primaryKeyword: "..."    # the low-freq keyword this post targets
funnel: "BOFU"           # TOFU | MOFU | BOFU (most "X API" posts are BOFU)
author: { name: "Aigenway" }   # optional; defaults to site author
relatedDocs:             # ≥2 internal links (hub-and-spoke). Root-relative only.
  - { label: "...", href: "/docs/..." }
ogImage: "..."           # optional; omit to use the auto-generated OG card
draft: true              # optional; drafts render only in dev, never in prod
```

The OG social card is **auto-generated** per post from `title` + `primaryKeyword`
(`[slug]/opengraph-image.tsx`). No hero/cover image is needed or rendered.

## Body

- **Lead**: first paragraph, 20–100 words (aim 40–70). State the keyword and the
  payoff (call model X from your own code via one API key) in the first sentence.
- **≥4 H2 sections** (`## `), unique headings. Recommended arc for an "X API" post:
  1. What you get / which models & methods (confirm live codes via `/v1/methods`)
  2. A concrete call — text-to-X or image-to-X (real `curl`)
  3. A second capability or the async task/webhook flow
  4. Why one gateway beats a provider-only account
- **≥1 fenced code block** — a real request to `https://api.aigenway.com/v1/generations`
  using the gateway's task contract: `provider` / `model` / `method` / `params`,
  `Authorization: Bearer sk_live_...`, `Idempotency-Key`. Do **not** invent model
  codes — either use ones confirmed on the account or tell the reader to list them.
- **≥1 inline `<SignupCTA ... />`** mid-article (a second CTA is auto-appended at
  the end of every post — don't duplicate that one; place yours after the first
  working example). Tailor `title`/`description` to the topic.
- **relatedDocs**: link only to routes that exist. Known targets:
  `/pricing`, `/docs/getting-started`, `/docs/authentication`, `/docs/errors`,
  `/docs/idempotency`, `/docs/webhooks`, `/docs/task-lifecycle`, `/docs/methods`,
  `/docs/guides/kling-video`, `/docs/guides/gemini-text`, and existing
  `/blog/<slug>` posts.

## Voice

Developer-to-developer, concrete, no fluff. Show the request, name the trade-off,
close on the product benefit (one API key, prepaid USD billing, one task contract
for every model). British/US spelling consistent with existing posts (US).
