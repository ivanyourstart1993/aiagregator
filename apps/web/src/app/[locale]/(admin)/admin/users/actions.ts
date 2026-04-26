'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, serverApi } from '@/lib/server-api';

export interface MutationResult {
  ok: boolean;
  code?: string;
}

function fail(err: unknown): MutationResult {
  if (err instanceof ApiError) return { ok: false, code: err.code };
  return { ok: false, code: 'internal_error' };
}

export async function toggleSandboxAction(
  userId: string,
  enable: boolean,
): Promise<MutationResult> {
  try {
    if (enable) await serverApi.adminEnableSandbox(userId);
    else await serverApi.adminDisableSandbox(userId);
    revalidatePath(`/(admin)/admin/users/${userId}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
