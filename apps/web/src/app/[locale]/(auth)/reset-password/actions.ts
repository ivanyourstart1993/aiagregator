'use server';

import { z } from 'zod';
import { ApiError, serverApi } from '@/lib/server-api';

const schema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(8).max(256),
});

export interface ResetPasswordResult {
  ok: boolean;
  code?: string;
}

export async function resetPasswordAction(
  input: z.input<typeof schema>,
): Promise<ResetPasswordResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.resetPassword(parsed.data.token, parsed.data.password);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
