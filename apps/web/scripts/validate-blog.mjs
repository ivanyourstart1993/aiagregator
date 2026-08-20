#!/usr/bin/env node
// Blog canon gate — the machine guard that lets articles be authored (by a
// human or the autopilot) without a human eyeballing every one before it ships.
//
// The blog is Next.js + MDX: each post is `src/content/blog/<slug>.mdx`
// (frontmatter + body) and MUST also be registered in `src/content/blog/index.ts`
// (imported `?raw` and appended to `rawPosts`). A file that exists but isn't
// registered renders nowhere; a registry entry with no file breaks the build.
// Everything the page actually renders — an auto `<SignupCTA>` at the end, a
// "Related docs" section from `relatedDocs`, H2 anchors via rehype-slug — is
// mirrored here so the gate matches production reality, not a wish list.
//
// Two severities: ERROR blocks the push (broken/unshippable), WARN is advisory
// SEO polish (length outside the sweet spot). Exit code is non-zero iff any
// ERROR fired, so it slots into `check:push` next to check:catalog.
//
// Run: node scripts/validate-blog.mjs        (from apps/web; exit 0 ok, 1 errors)

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const HERE = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = resolve(HERE, '../src/content/blog');
const INDEX_TS = resolve(BLOG_DIR, 'index.ts');

const FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU']);

// Thresholds. Hard bounds (ERROR) are deliberately generous — they catch broken
// or absurd content, not stylistic imperfection. Soft bounds (WARN) mark the SEO
// sweet spot the autopilot prompt aims for.
const TITLE_HARD = [20, 70];
const TITLE_SOFT = [30, 62];
const DESC_HARD = [110, 200];
const DESC_SOFT = [140, 165];
const LEAD_WORDS_HARD = [20, 100];
const MIN_H2 = 4;
const MAX_H2_SOFT = 9;

let errors = 0;
let warns = 0;

/** rehype-slug-compatible slugifier (github-slugger semantics, simplified). */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '') // strip inline html/jsx
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function wordCount(text) {
  return (text.trim().match(/\S+/g) ?? []).length;
}

/** First non-empty markdown paragraph (skips headings, jsx blocks, fences). */
function leadParagraph(body) {
  const blocks = body.split(/\n\s*\n/);
  for (const b of blocks) {
    const t = b.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('<') || t.startsWith('```') || t.startsWith('|'))
      continue;
    return t;
  }
  return '';
}

function err(slug, msg) {
  errors++;
  console.error(`  ✗ [${slug}] ${msg}`);
}
function warn(slug, msg) {
  warns++;
  console.warn(`  ! [${slug}] ${msg}`);
}

// --- Discover files and registry --------------------------------------------

const mdxFiles = readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => basename(f, '.mdx'))
  .sort();

const indexSrc = readFileSync(INDEX_TS, 'utf8');
// Registry entries look like: { slug: 'kling-api', raw: klingApi }
const registeredSlugs = [...indexSrc.matchAll(/slug:\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
const registeredSet = new Set(registeredSlugs);
const fileSet = new Set(mdxFiles);

// Cross-check registry ↔ files (registry-level errors, not tied to one post).
for (const slug of mdxFiles) {
  if (!registeredSet.has(slug))
    err(slug, `file ${slug}.mdx exists but is NOT registered in index.ts (append it to rawPosts)`);
}
for (const slug of registeredSlugs) {
  if (!fileSet.has(slug))
    err(slug, `index.ts registers slug "${slug}" but ${slug}.mdx does not exist`);
}
if (registeredSlugs.length !== registeredSet.size)
  err('index.ts', `duplicate slug(s) in registry: ${registeredSlugs.join(', ')}`);

// --- Per-post canon ----------------------------------------------------------

const allSlugs = new Set([...mdxFiles, ...registeredSlugs]);

for (const slug of mdxFiles) {
  const raw = readFileSync(resolve(BLOG_DIR, `${slug}.mdx`), 'utf8');
  let fm, body;
  try {
    const parsed = matter(raw);
    fm = parsed.data;
    body = parsed.content;
  } catch (e) {
    err(slug, `frontmatter failed to parse: ${e.message}`);
    continue;
  }

  // Required frontmatter.
  for (const key of ['title', 'description', 'date', 'primaryKeyword', 'funnel']) {
    if (!fm[key] || String(fm[key]).trim() === '') err(slug, `missing frontmatter: ${key}`);
  }
  if (!Array.isArray(fm.tags) || fm.tags.length === 0)
    err(slug, `tags must be a non-empty array`);

  // Title.
  if (fm.title) {
    const n = fm.title.length;
    if (n < TITLE_HARD[0] || n > TITLE_HARD[1]) err(slug, `title length ${n} outside ${TITLE_HARD.join('–')}`);
    else if (n < TITLE_SOFT[0] || n > TITLE_SOFT[1]) warn(slug, `title length ${n} outside SEO sweet spot ${TITLE_SOFT.join('–')}`);
  }

  // Description.
  if (fm.description) {
    const n = fm.description.length;
    if (n < DESC_HARD[0] || n > DESC_HARD[1]) err(slug, `description length ${n} outside ${DESC_HARD.join('–')}`);
    else if (n < DESC_SOFT[0] || n > DESC_SOFT[1]) warn(slug, `description length ${n} outside SEO sweet spot ${DESC_SOFT.join('–')}`);
  }

  // Date.
  if (fm.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(fm.date)))
    err(slug, `date "${fm.date}" is not YYYY-MM-DD`);
  if (fm.updated && !/^\d{4}-\d{2}-\d{2}$/.test(String(fm.updated)))
    err(slug, `updated "${fm.updated}" is not YYYY-MM-DD`);

  // Funnel.
  if (fm.funnel && !FUNNELS.has(fm.funnel))
    err(slug, `funnel "${fm.funnel}" not one of ${[...FUNNELS].join('/')}`);

  // Lead paragraph.
  const lead = leadParagraph(body);
  const leadWords = wordCount(lead);
  if (leadWords < LEAD_WORDS_HARD[0] || leadWords > LEAD_WORDS_HARD[1])
    err(slug, `lead paragraph ${leadWords} words, want ${LEAD_WORDS_HARD.join('–')}`);

  // H2 structure.
  const h2s = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
  if (h2s.length < MIN_H2) err(slug, `only ${h2s.length} H2 sections, need ≥${MIN_H2}`);
  else if (h2s.length > MAX_H2_SOFT) warn(slug, `${h2s.length} H2 sections (long); consider splitting`);
  const anchors = h2s.map(slugify);
  const dupAnchors = anchors.filter((a, i) => anchors.indexOf(a) !== i);
  if (dupAnchors.length) err(slug, `duplicate H2 anchors: ${[...new Set(dupAnchors)].join(', ')}`);

  // Code example (this is an API blog — every post should show a call).
  const fences = (body.match(/^```/gm) ?? []).length;
  if (fences < 2) err(slug, `no fenced code block found (API guide should show a request)`);
  else if (fences % 2 !== 0) err(slug, `unbalanced code fences (${fences} \`\`\` markers)`);

  // Inline conversion block (the end-of-post CTA is auto-rendered; this ensures
  // a mid-article pitch too).
  if (!/<SignupCTA[\s/>]/.test(body))
    err(slug, `no inline <SignupCTA /> — add at least one mid-article conversion block`);

  // relatedDocs.
  if (!Array.isArray(fm.relatedDocs) || fm.relatedDocs.length < 2) {
    err(slug, `relatedDocs must have ≥2 entries (hub-and-spoke internal links)`);
  } else {
    for (const doc of fm.relatedDocs) {
      if (!doc || typeof doc.href !== 'string' || typeof doc.label !== 'string') {
        err(slug, `relatedDocs entry malformed (needs {label, href})`);
        continue;
      }
      if (!doc.href.startsWith('/'))
        err(slug, `relatedDocs href "${doc.href}" must be root-relative (start with /)`);
      // A related link to another post must point at one that exists.
      const m = doc.href.match(/^\/blog\/([^/#?]+)/);
      if (m && !allSlugs.has(m[1]))
        err(slug, `relatedDocs points to /blog/${m[1]} which does not exist`);
    }
  }
}

// --- Report ------------------------------------------------------------------

const n = mdxFiles.length;
if (errors === 0) {
  console.log(`✓ blog canon: ${n} post(s) valid${warns ? ` (${warns} warning(s))` : ''}`);
  process.exit(0);
} else {
  console.error(`\n✗ blog canon: ${errors} error(s), ${warns} warning(s) across ${n} post(s)`);
  process.exit(1);
}
