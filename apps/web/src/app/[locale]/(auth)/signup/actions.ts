'use server';

import { z } from 'zod';
import { ApiError, serverApi } from '@/lib/server-api';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  locale: z.string().min(2).max(5),
});

export interface RegisterResult {
  ok: boolean;
  code?: string;
}

export async function registerUser(input: z.input<typeof schema>): Promise<RegisterResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_request' };
  }
  try {
    await serverApi.register(parsed.data);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code };
    }
    return { ok: false, code: 'internal_error' };
  }
}
