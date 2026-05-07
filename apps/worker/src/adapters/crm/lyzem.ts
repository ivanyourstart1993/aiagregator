// Lyzem TG-channel discovery — Lyzem.com indexes public Telegram channels
// and exposes a search page with no auth required. We scrape the public
// HTML of the search results page.
//
// NOTE: Lyzem may rotate its DOM or rate-limit aggressive scraping. The
// regex below targets `t.me/<username>` links which is the most stable
// signal. If Lyzem layout changes significantly, this handler will return
// 0 results — adjust LINK_RE accordingly.
//
// Recommended: pin a `proxyId` in the source config to spread requests
// across the existing residential proxy pool.

import type { DiscoveredLead, DiscoveryHandler } from './types';
import { proxyFetch } from './proxy-fetch';

interface Config {
  // Search query. Required.
  query: string;
  // Optional: pin requests through a specific proxy from the existing pool
  // (recommended — Lyzem will rate-limit a single IP doing many searches).
  proxyId?: string | null;
  // Soft floor on subscriber count for the channel (parsed from the result
  // card if present).
  minSubscribers?: number;
  // Limit on parsed results.
  limit?: number;
}

// `t.me/username` or `https://t.me/username`. Allows underscores and digits.
const LINK_RE = /https?:\/\/t\.me\/(?!s\/|joinchat\/|\+)([a-zA-Z][a-zA-Z0-9_]{2,31})/g;
// Subscriber count near the link, e.g. "12.3K subscribers" or "5,123 подписчиков".
const SUB_RE = /([\d][\d.,]*\s*[KkМмKkТт]?)\s*(?:subscribers?|подписчик)/i;

function parseSubs(text: string): number | null {
  const m = text.match(SUB_RE);
  if (!m) return null;
  let s = m[1].replace(/,/g, '').toLowerCase();
  let mult = 1;
  if (s.endsWith('k') || s.endsWith('к')) {
    mult = 1_000;
    s = s.slice(0, -1);
  } else if (s.endsWith('m') || s.endsWith('м')) {
    mult = 1_000_000;
    s = s.slice(0, -1);
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

function scoreChannel(subs: number | null, _name: string): number {
  if (!subs) return 10;
  if (subs > 100_000) return 90;
  if (subs > 10_000) return 70;
  if (subs > 1_000) return 50;
  return 30;
}

export const lyzemHandler: DiscoveryHandler = {
  kind: 'LYZEM_SEARCH',
  async run(rawConfig, ctx) {
    const config = rawConfig as unknown as Config;
    if (!config.query?.trim()) throw new Error('lyzem: config.query is required');

    const url = `https://lyzem.com/search?q=${encodeURIComponent(config.query.trim())}`;
    ctx.log(`lyzem: GET ${url}`);

    const res = await proxyFetch(url, {
      proxyId: config.proxyId ?? null,
      prisma: ctx.prisma,
      log: (m) => ctx.log(`lyzem: ${m}`),
      init: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        },
      },
    });
    if (!res.ok) {
      throw new Error(`lyzem: HTTP ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    ctx.log(`lyzem: fetched ${html.length} bytes`);

    // Dedup channels by username; for each, take the first surrounding
    // ~500-char context window so we can also extract subscribers + name.
    const seen = new Set<string>();
    const out: DiscoveredLead[] = [];
    const limit = Math.min(config.limit ?? 100, 500);
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(html)) !== null) {
      const username = m[1];
      if (seen.has(username.toLowerCase())) continue;
      seen.add(username.toLowerCase());

      const ctxStart = Math.max(0, m.index - 250);
      const ctxEnd = Math.min(html.length, m.index + 250);
      const window = html.slice(ctxStart, ctxEnd);
      const subs = parseSubs(window);

      if (
        config.minSubscribers != null &&
        (subs == null || subs < config.minSubscribers)
      ) {
        continue;
      }

      // Try to grab a nearby title (text inside an <a> or <h3>).
      const titleM = window.match(/>\s*([^<>{50,}]{3,80})\s*<\/(?:a|h2|h3)>/);
      const name = titleM?.[1]?.trim() ?? `@${username}`;

      out.push({
        type: 'TELEGRAM_CHANNEL',
        externalId: username.toLowerCase(),
        name: name.replace(/\s+/g, ' '),
        url: `https://t.me/${username}`,
        telegramUsername: username,
        score: scoreChannel(subs, name),
        metadata: {
          subscribers: subs,
          source: 'lyzem',
          query: config.query,
        },
      });

      if (out.length >= limit) break;
    }

    ctx.log(`lyzem: extracted ${out.length} channels`);
    return out;
  },
};
