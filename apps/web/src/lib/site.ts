/**
 * Canonical site identity. Centralised so blog metadata, sitemap, robots and
 * RSS all emit the same absolute origin. Override per-environment with
 * NEXT_PUBLIC_SITE_URL (e.g. a preview deploy); falls back to production.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.aigenway.com'
).replace(/\/+$/, '');

export const SITE_NAME = 'Aigenway';

export const SITE_TAGLINE =
  'One API for every AI image, video and text model.';

/** Default author/publisher used for blog schema when a post omits its own. */
export const SITE_AUTHOR = { name: SITE_NAME, url: SITE_URL } as const;
