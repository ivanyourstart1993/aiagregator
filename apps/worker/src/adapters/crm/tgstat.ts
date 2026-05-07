// TGStat web search discovery — TGStat indexes ~3M Telegram channels and
// exposes a search at https://tgstat.com/search?q=... with no auth needed.
//
// Same caveats as Lyzem: HTML can change. Use a residential proxy to avoid
// IP bans during crawls.

import type { DiscoveredLead, DiscoveryHandler } from './types';
import { proxyFetch } from './proxy-fetch';

interface Config {
  query: string;
  proxyId?: string | null;
  // 2-letter country to filter by (TGStat supports `country=RU/US/...`).
  country?: string;
  language?: string;
  minSubscribers?: number;
  limit?: number;
}

// TGStat uses absolute t.me/<username> + their own /channel/<username> links.
const TGSTAT_LINK_RE = /tgstat\.com\/(?:[a-z]+\/)?channel\/@?([a-zA-Z][a-zA-Z0-9_]{2,31})/g;
const TME_LINK_RE = /https?:\/\/t\.me\/(?!s\/|joinchat\/|\+)([a-zA-Z][a-zA-Z0-9_]{2,31})/g;
const SUB_RE = /(\d[\d.,\s]*)\s*(?:subscribers?|подписчик)/i;

function parseSubs(text: string): number | null {
  const m = text.match(SUB_RE);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function scoreChannel(subs: number | null): number {
  if (!subs) return 10;
  if (subs > 100_000) return 90;
  if (subs > 10_000) return 70;
  if (subs > 1_000) return 50;
  return 30;
}

export const tgstatHandler: DiscoveryHandler = {
  kind: 'TGSTAT_SEARCH',
  async run(rawConfig, ctx) {
    const config = rawConfig as unknown as Config;
    if (!config.query?.trim()) throw new Error('tgstat: config.query is required');

    const params = new URLSearchParams({ q: config.query.trim() });
    if (config.country) params.set('country', config.country);
    if (config.language) params.set('language', config.language);
    const url = `https://tgstat.com/search?${params.toString()}`;
    ctx.log(`tgstat: GET ${url}`);

    const res = await proxyFetch(url, {
      proxyId: config.proxyId ?? null,
      prisma: ctx.prisma,
      log: (m) => ctx.log(`tgstat: ${m}`),
      init: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      },
    });
    if (!res.ok) {
      throw new Error(`tgstat: HTTP ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    ctx.log(`tgstat: fetched ${html.length} bytes`);

    const seen = new Set<string>();
    const out: DiscoveredLead[] = [];
    const limit = Math.min(config.limit ?? 100, 500);

    function consider(username: string, idx: number) {
      const u = username.toLowerCase();
      if (seen.has(u)) return;
      seen.add(u);

      const ctxStart = Math.max(0, idx - 350);
      const ctxEnd = Math.min(html.length, idx + 350);
      const window = html.slice(ctxStart, ctxEnd);
      const subs = parseSubs(window);
      if (
        config.minSubscribers != null &&
        (subs == null || subs < config.minSubscribers)
      ) {
        return;
      }
      const titleM = window.match(/>\s*([^<>{50,}]{3,80})\s*<\/(?:a|h2|h3|span)>/);
      const name = titleM?.[1]?.trim() ?? `@${username}`;
      out.push({
        type: 'TELEGRAM_CHANNEL',
        externalId: u,
        name: name.replace(/\s+/g, ' '),
        url: `https://t.me/${username}`,
        telegramUsername: username,
        score: scoreChannel(subs),
        metadata: {
          subscribers: subs,
          source: 'tgstat',
          query: config.query,
        },
      });
    }

    let m: RegExpExecArray | null;
    while ((m = TGSTAT_LINK_RE.exec(html)) !== null) {
      consider(m[1], m.index);
      if (out.length >= limit) break;
    }
    if (out.length < limit) {
      while ((m = TME_LINK_RE.exec(html)) !== null) {
        consider(m[1], m.index);
        if (out.length >= limit) break;
      }
    }

    ctx.log(`tgstat: extracted ${out.length} channels`);
    return out;
  },
};
