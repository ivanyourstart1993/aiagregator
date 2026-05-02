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
  AUTH_JWT_ACCESS_TTL: Number(process.env.AUTH_JWT_ACCESS_TTL ?? 900),
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
