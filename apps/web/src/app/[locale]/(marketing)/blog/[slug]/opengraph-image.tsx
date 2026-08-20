import { ImageResponse } from 'next/og';
import { getPostBySlug } from '@/lib/blog';
import { SITE_NAME } from '@/lib/site';

// Read the post body from the filesystem-free bundled registry, so this must
// run on the Node runtime (not edge).
export const runtime = 'nodejs';

export const alt = `${SITE_NAME} blog`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const post = getPostBySlug(params.slug);
  const title = post?.frontmatter.title ?? SITE_NAME;
  const tag = post?.frontmatter.primaryKeyword ?? 'AI generation API';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#120d0b',
          padding: '72px',
          color: '#f4ece6',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            fontSize: 32,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: 'rgba(226,105,63,0.22)',
            }}
          />
          {SITE_NAME}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            maxHeight: 340,
            overflow: 'hidden',
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 28,
            color: '#b8a89c',
          }}
        >
          <span>{tag}</span>
          <span>aigenway.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
