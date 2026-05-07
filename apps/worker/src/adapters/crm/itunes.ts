// iTunes Search API discovery — totally free, no auth, returns rich JSON
// for any keyword search across the App Store. Doesn't require a proxy
// (Apple is permissive with rate limits).
//
// Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/

import type { DiscoveredLead, DiscoveryHandler } from './types';

interface Config {
  // Search query. Required. e.g. "ai image generator"
  term: string;
  // 2-letter country code; default 'us'.
  country?: string;
  // 1..200; default 50.
  limit?: number;
  // Apple categories: 'software' = paid+free apps. Don't change unless you
  // know what you're doing.
  media?: string;
  // Soft pre-filter on description / name keywords. If set, only apps whose
  // text matches at least one of these makes it through. Helps target
  // AI-relevant apps when "term" is broad.
  requireKeywords?: string[];
}

interface ItunesResultRaw {
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  artistName?: string;
  description?: string;
  trackViewUrl?: string;
  sellerUrl?: string;
  artistViewUrl?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  primaryGenreName?: string;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
}

interface ItunesResponse {
  resultCount: number;
  results: ItunesResultRaw[];
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
  'нейросет',
  'нейронн',
  'генерац',
];

function scoreApp(r: ItunesResultRaw): number {
  // Score 0..100. Heuristic:
  //  - 50% audience proxy (rating count, log-scaled)
  //  - 30% AI keyword density in name + description
  //  - 20% recent activity (updated within last 90d)
  let score = 0;
  const ratingCount = r.userRatingCount ?? 0;
  // log10 base, capped at 6 → 50 pts.
  const audPts = Math.min(50, Math.log10(Math.max(1, ratingCount)) * 8);
  score += audPts;

  const text = `${r.trackName ?? ''} ${r.description ?? ''}`.toLowerCase();
  let keywordHits = 0;
  for (const k of AI_KEYWORDS) if (text.includes(k)) keywordHits++;
  score += Math.min(30, keywordHits * 6);

  if (r.currentVersionReleaseDate) {
    const days =
      (Date.now() - new Date(r.currentVersionReleaseDate).getTime()) /
      86_400_000;
    if (days < 90) score += 20;
    else if (days < 365) score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function matchesKeywords(r: ItunesResultRaw, required: string[]): boolean {
  if (required.length === 0) return true;
  const hay = `${r.trackName ?? ''} ${r.description ?? ''}`.toLowerCase();
  return required.some((k) => hay.includes(k.toLowerCase()));
}

export const itunesHandler: DiscoveryHandler = {
  kind: 'ITUNES_SEARCH',
  async run(rawConfig, ctx) {
    const config = rawConfig as unknown as Config;
    if (!config.term?.trim()) throw new Error('itunes: config.term is required');

    const params = new URLSearchParams({
      term: config.term.trim(),
      country: config.country ?? 'us',
      media: config.media ?? 'software',
      limit: String(Math.min(Math.max(config.limit ?? 50, 1), 200)),
      entity: 'software',
    });
    const url = `https://itunes.apple.com/search?${params.toString()}`;
    ctx.log(`itunes: GET ${url}`);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'aigenway-crm/1.0' },
    });
    if (!res.ok) {
      throw new Error(`itunes: HTTP ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as ItunesResponse;
    ctx.log(`itunes: got ${data.resultCount} results`);

    const required = config.requireKeywords ?? [];
    const out: DiscoveredLead[] = [];
    for (const r of data.results) {
      if (!r.trackId || !r.trackName) continue;
      if (!matchesKeywords(r, required)) continue;
      out.push({
        type: 'MOBILE_APP_IOS',
        externalId: `id${r.trackId}`,
        name: r.trackName,
        url: r.trackViewUrl,
        ownerName: r.artistName,
        ownerWebsite: r.sellerUrl ?? r.artistViewUrl,
        score: scoreApp(r),
        metadata: {
          bundleId: r.bundleId,
          rating: r.averageUserRating,
          ratingCount: r.userRatingCount,
          genre: r.primaryGenreName,
          released: r.releaseDate,
          updated: r.currentVersionReleaseDate,
        },
      });
    }
    return out;
  },
};
