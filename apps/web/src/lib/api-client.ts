import { auth } from './auth';
import { env } from './env';

interface ApiErrorBody {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    request_id?: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** When true, do NOT attach the bearer token even if a session exists. */
  anonymous?: boolean;
}

async function buildHeaders(opts: FetchOptions, anonymous: boolean): Promise<HeadersInit> {
  const headers = new Headers(opts.headers);
  if (!headers.has('content-type') && opts.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  // Server-to-server boundary: every /internal/* call carries the shared
  // secret so the API can refuse direct calls from the public internet.
  if (env.INTERNAL_SERVICE_SECRET) {
    headers.set('x-internal-service-secret', env.INTERNAL_SERVICE_SECRET);
  }
  if (!anonymous) {
    // We need the raw HS256 JWT — encode it via the same NextAuth callback
    // chain. The simplest path is to ask NextAuth for the session and then
    // mint a token through its `jwt` callback by reading the raw cookie.
    // Here we lean on NextAuth's `auth()` to confirm a session exists, and
    // forward the cookie-bound token via the encode hook. To avoid duplicating
    // logic, we expose the encoded token via getServerJwt(). Falls back to no
    // auth header if we can't materialise a token (still useful for internal
    // routes that allow anonymous reads).
    const token = await getServerJwt();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * Mints a fresh HS256 JWT for the *current* server-side session, using the
 * same encoder configured in `auth.ts`. This works around the fact that
 * NextAuth v5 stores the encoded JWT in an httpOnly cookie and there's no
 * direct accessor for it from RSC.
 */
async function getServerJwt(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;

  const { SignJWT } = await import('jose');
  const { getJwtSecretBytes } = await import('./env');

  return await new SignJWT({
    role: session.user.role,
    emailVerified: session.user.emailVerified,
    email: session.user.email,
    name: session.user.name ?? null,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(session.user.id)
    .setIssuer(env.AUTH_JWT_ISSUER)
    .setAudience(env.AUTH_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.AUTH_JWT_ACCESS_TTL}s`)
    .sign(getJwtSecretBytes());
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { body, anonymous, ...rest } = opts;
  const headers = await buildHeaders(opts, anonymous ?? false);
  const url = path.startsWith('http') ? path : `${env.API_URL}${path}`;
  const init: RequestInit = {
    ...rest,
    headers,
    cache: rest.cache ?? 'no-store',
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const errBody = (parsed as ApiErrorBody) ?? {};
    const code = errBody.error?.code ?? 'internal_error';
    const message = errBody.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, code, message, errBody.error?.details, errBody.error?.request_id);
  }

  return parsed as T;
}

export const apiGet = <T = unknown>(path: string, opts?: FetchOptions) =>
  apiFetch<T>(path, { ...opts, method: 'GET' });

export const apiPost = <T = unknown>(path: string, body?: unknown, opts?: FetchOptions) =>
  apiFetch<T>(path, { ...opts, method: 'POST', body });

export const apiPatch = <T = unknown>(path: string, body?: unknown, opts?: FetchOptions) =>
  apiFetch<T>(path, { ...opts, method: 'PATCH', body });

export const apiDelete = <T = unknown>(path: string, opts?: FetchOptions) =>
  apiFetch<T>(path, { ...opts, method: 'DELETE' });
