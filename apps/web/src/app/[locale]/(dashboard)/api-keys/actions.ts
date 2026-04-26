'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError, serverApi, type ApiKeyView } from '@/lib/server-api';

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

export interface CreateKeyResult {
  ok: boolean;
  code?: string;
  plaintext?: string;
  webhookSecret?: string;
  key?: ApiKeyView;
}

export async function createKey(input: { name: string }): Promise<CreateKeyResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid_request' };
  try {
    const created = (await serverApi.createApiKey(parsed.data.name)) as {
      id: string;
      plaintext: string;
      key: ApiKeyView;
      webhookSecret?: string;
    };
    revalidatePath('/(dashboard)/api-keys', 'page');
    return {
      ok: true,
      plaintext: created.plaintext,
      webhookSecret: created.webhookSecret,
      key: created.key,
    };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}

export interface RotateWebhookResult {
  ok: boolean;
  code?: string;
  webhookSecret?: string;
}

export async function rotateWebhookSecretAction(id: string): Promise<RotateWebhookResult> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    const res = await serverApi.rotateWebhookSecret(id);
    revalidatePath('/(dashboard)/api-keys', 'page');
    return { ok: true, webhookSecret: res.webhookSecret };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}

export interface RevokeKeyResult {
  ok: boolean;
  code?: string;
}

export async function revokeKey(id: string): Promise<RevokeKeyResult> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.revokeApiKey(id);
    revalidatePath('/(dashboard)/api-keys', 'page');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
