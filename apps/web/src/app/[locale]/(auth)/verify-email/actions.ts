'use server';

import { ApiError, serverApi } from '@/lib/server-api';

export interface VerifyEmailResult {
  ok: boolean;
  code?: string;
}

export async function verifyEmail(token: string): Promise<VerifyEmailResult> {
  if (!token || token.length < 8) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.verifyEmail(token);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code };
    }
    return { ok: false, code: 'internal_error' };
  }
}
