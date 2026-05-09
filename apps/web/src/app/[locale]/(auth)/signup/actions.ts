'use server';

import { z } from 'zod';
import { ApiError, serverApi } from '@/lib/server-api';

// Mirror of the API-side blocklist — see apps/api/src/modules/auth/dto/register.dto.ts
// Keep in sync.
const URL_LIKE = /(https?:\/\/|www\.|\bbit\.ly\b|\bt\.me\b|\btinyurl\b|\bcutt\.ly\b|\bshorturl\b)/i;
const TELEGRAM_HANDLE = /@[A-Za-z0-9_]{4,}/;
const EMOJI_RUN = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]\s*){3,}/u;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((v) => !URL_LIKE.test(v))
    .refine((v) => !TELEGRAM_HANDLE.test(v))
    .refine((v) => !EMOJI_RUN.test(v)),
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
