// Google Service Account → OAuth2 access token (Bearer) helper.
//
// Used by adapters that talk to Vertex AI (Banana / Imagen / Veo). Signs
// a short-lived RS256 JWT with the SA's private key, exchanges it at the
// OAuth2 token endpoint for an access token, and caches the result in
// memory until ~2 minutes before expiry.
//
// Caller error policy: throws plain `Error` here; adapters wrap in their
// own AdapterError taxonomy for the worker / poll-cron retry logic.
import { createSign } from 'node:crypto';

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

function signJwtRS256(
  header: object,
  payload: object,
  privateKey: string,
): string {
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = createSign('RSA-SHA256').update(data).sign(privateKey, 'base64url');
  return `${data}.${sig}`;
}

/**
 * Returns a cached or freshly-minted Google OAuth2 access token for the
 * given Service Account, scoped to `cloud-platform`.
 *
 * Tokens are cached per `client_email` and refreshed when within 120s of
 * expiry. The token endpoint call goes through the default `fetch` (no
 * proxy) — Google's OAuth endpoint is reachable from anywhere; per-account
 * proxies only matter for the actual API calls.
 */
export async function getServiceAccountAccessToken(
  sa: ServiceAccountKey,
): Promise<string> {
  const cached = tokenCache.get(sa.client_email);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - 120 > now) return cached.token;

  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const jwt = signJwtRS256(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    },
    sa.private_key,
  );
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(
      `service-account token exchange failed: ${res.status} ${t.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error('no access_token in token response');
  }
  tokenCache.set(sa.client_email, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  });
  return json.access_token;
}

/**
 * Pull a ServiceAccountKey out of an opaque credentials blob (the JSON we
 * store on ProviderAccount). Accepts a few common field-name variants and
 * returns null when no SA is present (caller decides whether that's fatal).
 */
export function extractServiceAccount(
  credentials: Record<string, unknown> | null | undefined,
): ServiceAccountKey | null {
  if (!credentials) return null;
  const candidate =
    (credentials['serviceAccount'] as Record<string, unknown> | undefined) ??
    (credentials['service_account'] as Record<string, unknown> | undefined) ??
    (credentials['serviceAccountKey'] as Record<string, unknown> | undefined) ??
    (credentials['serviceAccountJson'] as Record<string, unknown> | undefined) ??
    // Some legacy entries stored the SA fields at the top level. If the
    // blob has the three required fields directly, treat it as the SA.
    (typeof credentials['client_email'] === 'string' &&
    typeof credentials['private_key'] === 'string' &&
    typeof credentials['project_id'] === 'string'
      ? credentials
      : undefined);
  if (!candidate) return null;
  const clientEmail = candidate['client_email'];
  const privateKey = candidate['private_key'];
  const projectId = candidate['project_id'];
  const tokenUri = candidate['token_uri'];
  if (
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string' ||
    typeof projectId !== 'string'
  ) {
    return null;
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: projectId,
    token_uri: typeof tokenUri === 'string' ? tokenUri : undefined,
  };
}
