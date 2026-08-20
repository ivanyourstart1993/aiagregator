import matter from 'gray-matter';
import { rawPosts } from '@/content/blog';

export type Funnel = 'TOFU' | 'MOFU' | 'BOFU';

export interface RelatedDoc {
  label: string;
  href: string;
}

export interface PostFrontmatter {
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** ISO date of last meaningful edit; defaults to `date`. */
  updated?: string;
  tags?: string[];
  primaryKeyword?: string;
  funnel?: Funnel;
  author?: { name: string; url?: string };
  /** Absolute or root-relative OG image; falls back to the generated card. */
  ogImage?: string;
  /** Override canonical (rarely needed; defaults to /blog/<slug>). */
  canonical?: string;
  draft?: boolean;
  relatedDocs?: RelatedDoc[];
}

export interface Post {
  slug: string;
  /** MDX body with frontmatter stripped, ready for compileMDX. */
  body: string;
  frontmatter: PostFrontmatter;
  readingTimeMinutes: number;
}

function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function toPost({ slug, raw }: { slug: string; raw: string }): Post {
  const { data, content } = matter(raw);
  return {
    slug,
    body: content,
    frontmatter: data as PostFrontmatter,
    readingTimeMinutes: Math.max(1, Math.round(wordCount(content) / 200)),
  };
}

// Parsed once at module load. Drafts are shown only in development so authors
// can preview them locally without shipping them to the live sitemap/feed.
const posts: Post[] = rawPosts
  .map(toPost)
  .filter((p) => process.env.NODE_ENV === 'development' || !p.frontmatter.draft)
  .sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1));

export function getAllPosts(): Post[] {
  return posts;
}

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const p of posts) for (const t of p.frontmatter.tags ?? []) tags.add(t);
  return [...tags].sort();
}

/**
 * Cover image for a post. Prefers an explicit `ogImage` (a real 16:9 asset the
 * autopilot generates into /public/blog/<slug>.jpg); otherwise falls back to the
 * auto-generated branded OG card route so no post is ever imageless. Returns a
 * root-relative (same-origin) src suitable for an <img> on the prefix-less EN
 * blog.
 */
export function coverImageSrc(post: Post): string {
  return post.frontmatter.ogImage ?? `/blog/${post.slug}/opengraph-image`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
