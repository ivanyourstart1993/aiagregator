/**
 * Centralised env access for the web app.
 * We deliberately avoid throwing at module load so that `next build`
 * can succeed in CI without runtime secrets — values are only required
 * when the corresponding feature is actually used at runtime.
 */

export const env = {
  API_URL: process.env.API_URL ?? 'http://localhost:4000',
  WEB_URL: process.env.WEB_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? '',
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER ?? 'aiagg',
  AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE ?? 'aiagg-api',
  // TTL for short-lived bearer tokens minted server-side for /internal
  // calls (see api-client.ts). 15 min is fine — they're issued per
  // request and not stored in cookies.
  AUTH_JWT_ACCESS_TTL: Number(process.env.AUTH_JWT_ACCESS_TTL ?? 900),
  // Lifetime of the dashboard session cookie (NextAuth JWT strategy).
  // Must be MUCH longer than the access TTL above — otherwise the user
  // is bounced back to /login every 15 minutes. Default 30 days; sliding
  // refresh extends it on every visit (see authConfig.session.updateAge).
  AUTH_SESSION_TTL: Number(process.env.AUTH_SESSION_TTL ?? 60 * 60 * 24 * 30),
  AUTH_SESSION_UPDATE_AGE: Number(
    process.env.AUTH_SESSION_UPDATE_AGE ?? 60 * 60 * 24,
  ),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  INTERNAL_SERVICE_SECRET: process.env.INTERNAL_SERVICE_SECRET ?? '',
} as const;

export function getJwtSecretBytes(): Uint8Array {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}
