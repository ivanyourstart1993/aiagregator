import type { Post } from '@/lib/blog';

/**
 * Post cover. Shows the real `ogImage` asset when present (a 16:9 image the
 * autopilot generates into /public/blog/<slug>.jpg); otherwise renders a
 * branded gradient "poster" with the primary keyword — a clean, dependency-free
 * placeholder so no post is ever imageless or shows a broken image. Parent
 * controls the aspect ratio / rounding.
 */
export function CoverImage({ post, priority = false }: { post: Post; priority?: boolean }) {
  const { ogImage, title, primaryKeyword } = post.frontmatter;

  if (ogImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ogImage}
        alt={title}
        loading={priority ? 'eager' : 'lazy'}
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#241512] via-[#1a1210] to-[#0d0908] p-6">
      <span className="text-center font-serif text-lg font-medium leading-snug text-[#f4ece6] sm:text-2xl">
        {primaryKeyword ?? title}
      </span>
    </div>
  );
}
