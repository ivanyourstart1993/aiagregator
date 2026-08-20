#!/usr/bin/env node
// Topic queue CLI for the blog autopilot. Node-only (no Python here).
//
//   node queue.mjs next            → prints the first pending topic as JSON (or nothing)
//   node queue.mjs mark <slug> <status>   → set status: pending|published|failed
//   node queue.mjs stats           → counts by status
//   node queue.mjs add <file.json> → append topic objects from a JSON file/array
//
// The queue is the single source of intent. The runner marks `published` ONLY
// after an independent HTTP check confirms the live post — never on the agent's
// word — so a "reported done but not actually live" run lands in `failed` and
// the same keyword is not written twice tomorrow.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUEUE = resolve(HERE, 'queue.json');
const STATUSES = new Set(['pending', 'published', 'failed']);

function load() {
  const data = JSON.parse(readFileSync(QUEUE, 'utf8'));
  if (!Array.isArray(data.topics)) throw new Error('queue.json: missing "topics" array');
  return data;
}
function save(data) {
  writeFileSync(QUEUE, JSON.stringify(data, null, 2) + '\n');
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'next': {
    const t = load().topics.find((x) => x.status === 'pending');
    if (t) process.stdout.write(JSON.stringify(t));
    break;
  }
  case 'mark': {
    const [slug, status] = rest;
    if (!slug || !STATUSES.has(status)) {
      console.error(`usage: queue.mjs mark <slug> <${[...STATUSES].join('|')}>`);
      process.exit(2);
    }
    const data = load();
    const t = data.topics.find((x) => x.slug === slug);
    if (!t) {
      console.error(`no topic with slug "${slug}"`);
      process.exit(1);
    }
    t.status = status;
    save(data);
    console.log(`marked ${slug} → ${status}`);
    break;
  }
  case 'stats': {
    const counts = { pending: 0, published: 0, failed: 0 };
    for (const t of load().topics) counts[t.status] = (counts[t.status] ?? 0) + 1;
    console.log(JSON.stringify(counts));
    break;
  }
  case 'add': {
    const file = rest[0];
    if (!file) {
      console.error('usage: queue.mjs add <file.json>');
      process.exit(2);
    }
    const incoming = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
    const items = Array.isArray(incoming) ? incoming : incoming.topics;
    if (!Array.isArray(items)) throw new Error('add: expected an array or { topics: [...] }');
    const data = load();
    const maxId = data.topics.reduce((m, t) => Math.max(m, t.id ?? 0), 0);
    let next = maxId;
    for (const it of items) data.topics.push({ id: ++next, status: 'pending', ...it });
    save(data);
    console.log(`added ${items.length} topic(s)`);
    break;
  }
  default:
    console.error('usage: queue.mjs <next|mark|stats|add>');
    process.exit(2);
}
