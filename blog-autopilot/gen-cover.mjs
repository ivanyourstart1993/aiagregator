#!/usr/bin/env node
// Generate a 16:9 hero cover for a blog post via the aigenway gateway itself
// (dogfooding), save it to apps/web/public/blog/<slug>.png, and set `ogImage`
// in the post's frontmatter. Idempotent: if ogImage is already set and the file
// exists, it does nothing.
//
//   node blog-autopilot/gen-cover.mjs <slug> [--force]
//
// Key: $AIGENWAY_KEY or /root/.config/blog-autopilot/aigenway.key (sk_live_...),
// an account with MAIN balance + pricing enabled. ~ $0.06 per cover.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const BASE = process.env.AIGENWAY_BASE || 'https://api.aigenway.com';
const KEY_FILE = process.env.AIGENWAY_KEY_FILE || '/root/.config/blog-autopilot/aigenway.key';
const MODEL = process.env.AIGENWAY_IMAGE_MODEL || 'gpt-image-2';
const PROVIDER = process.env.AIGENWAY_IMAGE_PROVIDER || 'openai_image';

const slug = process.argv[2];
const force = process.argv.includes('--force');
if (!slug) {
  console.error('usage: gen-cover.mjs <slug> [--force]');
  process.exit(2);
}

const key = (process.env.AIGENWAY_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8') : '')).trim();
if (!key) {
  console.error(`no aigenway key ($AIGENWAY_KEY or ${KEY_FILE})`);
  process.exit(1);
}

const mdxPath = resolve(REPO, `apps/web/src/content/blog/${slug}.mdx`);
if (!existsSync(mdxPath)) {
  console.error(`no such post: ${mdxPath}`);
  process.exit(1);
}
const src = readFileSync(mdxPath, 'utf8');
const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
if (!fmMatch) {
  console.error('no frontmatter block found');
  process.exit(1);
}
const fm = fmMatch[1];
const field = (name) => {
  const m = fm.match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, 'm'));
  return m ? m[1].trim() : '';
};
const title = field('title');
const primaryKeyword = field('primaryKeyword') || title;
const alreadyHasImage = /^ogImage:/m.test(fm);

const publicDir = resolve(REPO, 'apps/web/public/blog');
const outFile = resolve(publicDir, `${slug}.png`);
if (alreadyHasImage && existsSync(outFile) && !force) {
  console.log(`cover already present for ${slug} — skipping`);
  process.exit(0);
}

const prompt =
  `Editorial hero illustration for a developer article titled "${title}". ` +
  `Abstract, modern, minimalist technology aesthetic evoking ${primaryKeyword}. ` +
  `Deep warm-dark background near #120d0b, subtle glowing geometric forms, flowing ` +
  `connective lines and soft cinematic lighting, high detail, premium editorial look. ` +
  `Absolutely no text, no letters, no words, no numbers, no UI elements. 16:9 composition.`;

const auth = { Authorization: `Bearer ${key}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[gen-cover] ${slug}: creating generation (${PROVIDER}/${MODEL})`);
  const createRes = await fetch(`${BASE}/v1/generations`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      provider: PROVIDER,
      model: MODEL,
      method: 'text_to_image',
      // NOTE: adding `mode`/`quality` can route to an unpriced bundle
      // (422 price_not_configured). These exact params match a priced bundle;
      // if you change them, re-check with POST /v1/estimate first.
      params: { prompt, aspect_ratio: '16:9' },
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`create failed ${createRes.status}: ${JSON.stringify(created)}`);
  const taskId = created.task_id || created.id;
  if (!taskId) throw new Error(`no task_id in response: ${JSON.stringify(created)}`);

  // Poll until terminal.
  let fileUrl = null;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const pr = await fetch(`${BASE}/v1/generations/${taskId}`, { headers: auth });
    const task = await pr.json();
    const status = String(task.status || '').toUpperCase();
    if (status === 'SUCCEEDED' || status === 'SUCCESS' || status === 'COMPLETED') {
      fileUrl = task.result?.files?.[0]?.url || task.files?.[0]?.url || task.result?.url;
      if (!fileUrl) throw new Error(`succeeded but no file url: ${JSON.stringify(task).slice(0, 400)}`);
      break;
    }
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(`generation ${status}: ${JSON.stringify(task).slice(0, 400)}`);
    }
    console.log(`[gen-cover] ${slug}: ${status || 'pending'}…`);
  }
  if (!fileUrl) throw new Error('timed out waiting for generation');

  // Download (signed url may still want the bearer; harmless if not).
  const imgRes = await fetch(fileUrl, { headers: auth });
  if (!imgRes.ok) throw new Error(`download failed ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(outFile, buf);
  console.log(`[gen-cover] ${slug}: saved ${outFile} (${Math.round(buf.length / 1024)} KB)`);

  // Set ogImage in frontmatter (replace or insert before closing ---).
  const ogLine = `ogImage: "/blog/${slug}.png"`;
  let next;
  if (alreadyHasImage) {
    next = src.replace(/^ogImage:.*$/m, ogLine);
  } else {
    next = src.replace(/^---\n([\s\S]*?)\n---/, (m, body) => `---\n${body}\n${ogLine}\n---`);
  }
  writeFileSync(mdxPath, next);
  console.log(`[gen-cover] ${slug}: set ${ogLine}`);
}

main().catch((e) => {
  console.error(`[gen-cover] ${slug} FAILED: ${e.message}`);
  process.exit(1);
});
