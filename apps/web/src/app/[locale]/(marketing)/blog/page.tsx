import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/blog';
import { PostCard } from '@/components/blog/PostCard';
import { SignupCTA } from '@/components/blog/SignupCTA';
import { SITE_NAME, SITE_URL } from '@/lib/site';

const TITLE = 'Blog';
const DESCRIPTION =
  'Guides and deep-dives on AI image, video and text generation APIs — Kling, Veo, Nano Banana, Seedance and more, all behind one key and one prepaid USD balance.';

export function generateMetadata(): Metadata {
  const url = `${SITE_URL}/blog`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      canonical: url,
      types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
    },
    openGraph: {
      type: 'website',
      url,
      title: `${TITLE} | ${SITE_NAME}`,
      description: DESCRIPTION,
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${TITLE} | ${SITE_NAME}`,
      description: DESCRIPTION,
    },
  };
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 md:px-6 md:py-20">
      <header className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-info">Blog</p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">
          Build with AI generation APIs
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Practical guides to image, video and text generation — one API key, prepaid USD billing,
          every major model. No per-provider accounts, no credit systems.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="mt-12 text-sm text-muted-foreground">No posts yet — check back soon.</p>
      ) : (
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}

      <SignupCTA
        className="mt-12"
        title="One key, every model"
        description="Stop juggling provider accounts. Sign up, drop in a single API key, and call Kling, Veo, Nano Banana and more with prepaid USD billing."
      />
    </div>
  );
}
