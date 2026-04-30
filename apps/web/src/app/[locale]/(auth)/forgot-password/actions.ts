'use server';

import { z } from 'zod';
import { ApiError, serverApi } from '@/lib/server-api';

const schema = z.object({
  email: z.string().email().max(254),
});

export interface ForgotPasswordResult {
  ok: boolean;
  code?: string;
}

export async function requestPasswordReset(
  input: z.input<typeof schema>,
): Promise<ForgotPasswordResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.forgotPassword(parsed.data.email);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
