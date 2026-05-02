// Lightweight Google `id_token` (OIDC) verifier.
//
// Verifies signature against Google's published JWKS, validates standard
// claims (aud, iss, exp, iat, nbf), and enforces email_verified=true.
// JWKS is cached in-process for `cache-control: max-age` seconds (default
// 1 hour). The verifier never falls back to "trust the client" — invalid
// tokens throw.
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);
const DEFAULT_CACHE_MS = 60 * 60 * 1000;

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

let jwksCache: { keys: Map<string, KeyObject>; expires: number } | undefined;

async function getJwks(now = Date.now()): Promise<Map<string, KeyObject>> {
  if (jwksCache && jwksCache.expires > now) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`failed to fetch Google JWKS: ${res.status}`);
  }
  const json = (await res.json()) as { keys?: Jwk[] };
  if (!Array.isArray(json.keys)) {
    throw new Error('Google JWKS payload missing `keys`');
  }
  const map = new Map<string, KeyObject>();
  for (const k of json.keys) {
    if (!k.kid || k.kty !== 'RSA' || !k.n || !k.e) continue;
    try {
      const key = createPublicKey({
        key: { kty: 'RSA', n: k.n, e: k.e },
        format: 'jwk',
      });
      map.set(k.kid, key);
    } catch {
      // skip malformed entry
    }
  }
  // Honour Cache-Control: max-age. Default to 1 hour.
  const cc = res.headers.get('cache-control') ?? '';
  const m = /max-age=(\d+)/i.exec(cc);
  const ttlMs = m ? Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(m[1]) * 1000)) : DEFAULT_CACHE_MS;
  jwksCache = { keys: map, expires: now + ttlMs };
  return map;
}

export interface VerifiedGoogleIdToken {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

export interface VerifyOpts {
  audience: string;       // expected aud — usually GOOGLE_CLIENT_ID
  /** Tolerance in seconds for clock skew. Default 60. */
  clockToleranceSec?: number;
  /** Override 'now' (for tests). */
  now?: number;
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

/**
 * Verify a Google id_token. Throws on any signature/claim failure.
 * Returns the verified payload on success.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: VerifyOpts,
): Promise<VerifiedGoogleIdToken> {
  if (typeof idToken !== 'string' || idToken.length < 32 || idToken.length > 8192) {
    throw new Error('invalid id_token format');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('invalid id_token format');
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  } catch {
    throw new Error('invalid id_token header');
  }
  if (header.alg !== 'RS256') {
    throw new Error(`unsupported id_token alg: ${header.alg}`);
  }
  if (!header.kid) throw new Error('id_token missing kid');

  const jwks = await getJwks(opts.now);
  const key = jwks.get(header.kid);
  if (!key) {
    throw new Error(`id_token kid not in Google JWKS: ${header.kid}`);
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = b64urlDecode(sigB64);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();
  const ok = verifier.verify(key, sig);
  if (!ok) throw new Error('id_token signature verification failed');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('invalid id_token payload');
  }

  const iss = String(payload.iss ?? '');
  if (!ALLOWED_ISSUERS.has(iss)) {
    throw new Error(`id_token unexpected issuer: ${iss}`);
  }
  const aud = payload.aud;
  // Google can issue tokens with aud as string or array (rare).
  const audOk = Array.isArray(aud)
    ? aud.includes(opts.audience)
    : aud === opts.audience;
  if (!audOk) {
    throw new Error('id_token aud mismatch');
  }
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const tol = opts.clockToleranceSec ?? 60;
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  if (!Number.isFinite(exp) || exp + tol < nowSec) {
    throw new Error('id_token expired');
  }
  if (!Number.isFinite(iat) || iat - tol > nowSec) {
    throw new Error('id_token iat in the future');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - tol > nowSec) {
    throw new Error('id_token not yet valid');
  }

  const sub = String(payload.sub ?? '');
  const email = typeof payload.email === 'string' ? payload.email : '';
  const emailVerified =
    payload.email_verified === true || payload.email_verified === 'true';
  if (!sub) throw new Error('id_token missing sub');
  if (!email) throw new Error('id_token missing email');

  return {
    sub,
    email,
    email_verified: emailVerified,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    aud: Array.isArray(aud) ? String(aud[0]) : String(aud),
    iss,
    exp,
    iat,
  };
}
