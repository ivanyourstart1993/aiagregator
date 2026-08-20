import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

// Hand-maintained list of indexable EN (prefix-less) routes. The catalog-driven
// /docs/methods/* pages require an authenticated API call to enumerate, so they
// are intentionally left to organic discovery via the docs nav rather than
// fetched here at build time.
const STATIC_PATHS = [
  '',
  '/pricing',
  '/blog',
  '/docs/getting-started',
  '/docs/authentication',
  '/docs/errors',
  '/docs/idempotency',
  '/docs/webhooks',
  '/docs/task-lifecycle',
  '/docs/methods',
  '/docs/guides/kling-video',
  '/docs/guides/gemini-text',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  const postEntries: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.frontmatter.updated ?? post.frontmatter.date),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries];
}
