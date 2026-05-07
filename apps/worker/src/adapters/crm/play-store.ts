// Google Play discovery — uses google-play-scraper npm package which
// scrapes the public Play Store HTML/JSON without needing API credentials.
// Lower reliability than iTunes (Google can change DOM), but still useful.
//
// npm: https://github.com/facundoolano/google-play-scraper

import type { DiscoveredLead, DiscoveryHandler } from './types';

interface Config {
  // Search query. Required.
  term: string;
  // 2-letter country code; default 'us'.
  country?: string;
  // Language; default 'en'.
  lang?: string;
  // Max results to fetch; default 50, max 250.
  num?: number;
  // Optional pre-filter on title/description text.
  requireKeywords?: string[];
}

interface PlayResult {
  appId: string;
  title?: string;
  url?: string;
  developer?: string;
  developerEmail?: string;
  developerWebsite?: string;
  summary?: string;
  description?: string;
  scoreText?: string;
  score?: number;
  ratings?: number;
  reviews?: number;
  installs?: string; // "10,000,000+"
  minInstalls?: number;
  maxInstalls?: number;
  released?: string;
  updated?: number;
  genre?: string;
}

const AI_KEYWORDS = [
  'ai',
  'artificial intelligence',
  'neural',
  'gpt',
  'midjourney',
  'stable diffusion',
  'image generator',
  'video generator',
  'text to image',
  'image to video',
];

function scoreApp(r: PlayResult): number {
  let score = 0;
  // Audience: log-scale on minInstalls or ratings.
  const installs = r.minInstalls ?? r.ratings ?? 0;
  score += Math.min(50, Math.log10(Math.max(1, installs)) * 7);

  const text = `${r.title ?? ''} ${r.summary ?? ''} ${r.description ?? ''}`.toLowerCase();
  let kw = 0;
  for (const k of AI_KEYWORDS) if (text.includes(k)) kw++;
  score += Math.min(30, kw * 6);

  if (r.updated) {
    const days = (Date.now() - r.updated) / 86_400_000;
    if (days < 90) score += 20;
    else if (days < 365) score += 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function matchesKeywords(r: PlayResult, required: string[]): boolean {
  if (required.length === 0) return true;
  const hay = `${r.title ?? ''} ${r.description ?? ''}`.toLowerCase();
  return required.some((k) => hay.includes(k.toLowerCase()));
}

export const playStoreHandler: DiscoveryHandler = {
  kind: 'PLAY_STORE_SEARCH',
  async run(rawConfig, ctx) {
    const config = rawConfig as unknown as Config;
    if (!config.term?.trim()) throw new Error('play-store: config.term is required');

    // Lazy-import the CommonJS package — it pulls in cheerio etc., so we
    // don't want it loaded if the worker only ever runs other handlers.
    const mod = (await import('google-play-scraper')) as {
      default?: { search: (opts: unknown) => Promise<unknown[]>; app: (opts: unknown) => Promise<unknown> };
      search?: (opts: unknown) => Promise<unknown[]>;
      app?: (opts: unknown) => Promise<unknown>;
    };
    const gplay = mod.default ?? (mod as never);
    const num = Math.min(Math.max(config.num ?? 50, 1), 250);

    ctx.log(`play-store: search term="${config.term}" num=${num}`);
    const searchResults = (await gplay.search({
      term: config.term.trim(),
      country: config.country ?? 'us',
      lang: config.lang ?? 'en',
      num,
      fullDetail: true, // include description, ratings, developerEmail
    })) as PlayResult[];

    ctx.log(`play-store: got ${searchResults.length} results`);

    const required = config.requireKeywords ?? [];
    const out: DiscoveredLead[] = [];
    for (const r of searchResults) {
      if (!r.appId || !r.title) continue;
      if (!matchesKeywords(r, required)) continue;
      out.push({
        type: 'MOBILE_APP_ANDROID',
        externalId: r.appId,
        name: r.title,
        url: r.url,
        ownerName: r.developer,
        ownerEmail: r.developerEmail,
        ownerWebsite: r.developerWebsite,
        score: scoreApp(r),
        metadata: {
          appId: r.appId,
          installs: r.installs,
          minInstalls: r.minInstalls,
          rating: r.score,
          ratings: r.ratings,
          reviews: r.reviews,
          genre: r.genre,
          released: r.released,
          updated: r.updated ? new Date(r.updated).toISOString() : null,
        },
      });
    }
    return out;
  },
};
