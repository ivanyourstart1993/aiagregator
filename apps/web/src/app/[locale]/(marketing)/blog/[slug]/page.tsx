import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { getAllPosts, getPostBySlug, formatDate } from '@/lib/blog';
import { mdxComponents } from '@/components/blog/mdx-components';
import { SignupCTA } from '@/components/blog/SignupCTA';
import { SITE_AUTHOR, SITE_NAME, SITE_URL } from '@/lib/site';

interface BlogPostParams {
  params: { locale: string; slug: string };
}

export function generateMetadata({ params }: BlogPostParams): Metadata {
  const post = getPostBySlug(params.slug);
  if (!post) return {};

  const { title, description, date, updated, ogImage, canonical, tags } = post.frontmatter;
  const url = canonical ?? `${SITE_URL}/blog/${post.slug}`;
  const images = ogImage ? [ogImage] : undefined;
  // EN-only blog: keep non-default locales out of the index but let them be
  // crawled/followed, with the canonical pointing back to the prefix-less URL.
  const isDefaultLocale = params.locale === 'en';

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: isDefaultLocale ? undefined : { index: false, follow: true },
    keywords: tags,
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: SITE_NAME,
      publishedTime: date,
      modifiedTime: updated ?? date,
      tags,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostParams) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  const { title, description, date, updated, tags, author, relatedDocs, ogImage } =
    post.frontmatter;

  const { content } = await compileMDX({
    source: post.body,
    components: mdxComponents,
    options: {
      parseFrontmatter: false,
      mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] },
    },
  });

  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = ogImage
    ? ogImage.startsWith('http')
      ? ogImage
      : `${SITE_URL}${ogImage}`
    : `${url}/opengraph-image`;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: date,
    dateModified: updated ?? date,
    image,
    author: {
      '@type': 'Organization',
      name: author?.name ?? SITE_AUTHOR.name,
      url: author?.url ?? SITE_AUTHOR.url,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.svg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(tags && tags.length > 0 ? { keywords: tags.join(', ') } : {}),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All posts
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <time dateTime={date}>{formatDate(date)}</time>
          <span aria-hidden>·</span>
          <span>{post.readingTimeMinutes} min read</span>
        </div>
        <h1 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{description}</p>
        {tags && tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-8">{content}</div>

      {relatedDocs && relatedDocs.length > 0 ? (
        <section className="mt-10 rounded-lg border border-border/60 bg-card/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Related docs
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {relatedDocs.map((doc) => (
              <li key={doc.href}>
                <Link
                  href={doc.href}
                  className="font-medium text-info underline underline-offset-4 hover:opacity-80"
                >
                  {doc.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SignupCTA
        className="mt-10"
        title="Ready to ship it?"
        description="Create a free account, grab an API key, and call every model in this guide from your own code in minutes — prepaid USD billing, no per-provider setup."
      />
    </article>
  );
}
