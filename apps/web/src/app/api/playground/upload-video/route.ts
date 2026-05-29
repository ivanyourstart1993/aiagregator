import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServerJwt } from '@/lib/api-client';
import { env } from '@/lib/env';

// Node runtime: we stream the body, mint an HS256 JWT (jose), and read the
// server-only INTERNAL_SERVICE_SECRET — none of which work on the edge.
export const runtime = 'nodejs';

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Streaming proxy for reference-video uploads. The browser PUTs the file
 * here; we forward the body straight to the API's internal upload endpoint
 * without buffering it in the Next server's memory (`duplex: 'half'` lets
 * fetch send a ReadableStream body). The API in turn streams it into MinIO.
 *
 * Why a Route Handler and not a Server Action: server actions buffer the
 * whole payload and are capped at 2MB (next.config), unusable for video.
 * Why proxy at all: the API's /internal/* routes require the server-only
 * INTERNAL_SERVICE_SECRET, so the browser can't call them directly.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Sign in required' } },
      { status: 401 },
    );
  }

  const ct = (req.headers.get('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  if (!ALLOWED_VIDEO_MIME.has(ct)) {
    return NextResponse.json(
      {
        error: {
          code: 'unsupported_media_type',
          message: `Allowed video types: ${[...ALLOWED_VIDEO_MIME].join(', ')}`,
        },
      },
      { status: 415 },
    );
  }

  // Fast-reject oversize uploads when the browser declares Content-Length
  // (the API enforces the real cap mid-stream regardless).
  const declaredLen = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLen) && declaredLen > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      {
        error: {
          code: 'payload_too_large',
          message: `Max video size is ${Math.floor(MAX_VIDEO_BYTES / (1024 * 1024))}MB`,
        },
      },
      { status: 413 },
    );
  }

  if (!req.body) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Empty body' } },
      { status: 400 },
    );
  }

  const token = await getServerJwt();
  const headers = new Headers({ 'content-type': ct });
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (env.INTERNAL_SERVICE_SECRET) {
    headers.set('x-internal-service-secret', env.INTERNAL_SERVICE_SECRET);
  }

  let apiRes: Response;
  try {
    // `duplex: 'half'` is required by undici to send a streaming request body
    // but is absent from the DOM RequestInit typings — cast to add it.
    apiRes = await fetch(`${env.API_URL}/internal/playground/uploads/video`, {
      method: 'POST',
      headers,
      body: req.body,
      cache: 'no-store',
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'upstream_error', message: String(err) } },
      { status: 502 },
    );
  }

  const text = await apiRes.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!apiRes.ok) {
    const body = (parsed as { error?: { code?: string; message?: string } }) ?? {};
    return NextResponse.json(
      {
        error: {
          code: body.error?.code ?? 'upload_failed',
          message: body.error?.message ?? `Upload failed (${apiRes.status})`,
        },
      },
      { status: apiRes.status },
    );
  }

  return NextResponse.json(parsed ?? { ok: true });
}
