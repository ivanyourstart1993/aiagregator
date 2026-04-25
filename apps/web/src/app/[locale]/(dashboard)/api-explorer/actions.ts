'use server';

/**
 * Stage 6 server actions for the API Explorer.
 *
 * Pivot note: the public /v1/* endpoints require an API-key bearer token
 * (sk_live_...). We cannot recover the plaintext secret server-side after
 * key creation (only an argon2id hash is stored), so we intentionally do
 * NOT proxy /v1/* calls through server actions. Instead, the cabinet UI
 * builds a cURL command that the user runs locally with their own
 * (plaintext) key. These actions are kept as a thin layer for future use
 * once a backend `POST /internal/api-explorer/{estimate,generate}` exists
 * (those would auth via the cabinet JWT and reuse the same admit logic).
 */
import { ApiError, serverApi } from '@/lib/server-api';

export interface ListActiveKeysResult {
  ok: boolean;
  hasActiveKey: boolean;
  code?: string;
}

export async function listActiveKeysAction(): Promise<ListActiveKeysResult> {
  try {
    const keys = await serverApi.listApiKeys();
    return { ok: true, hasActiveKey: keys.some((k) => k.status === 'ACTIVE') };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, hasActiveKey: false, code: err.code };
    return { ok: false, hasActiveKey: false, code: 'internal_error' };
  }
}
