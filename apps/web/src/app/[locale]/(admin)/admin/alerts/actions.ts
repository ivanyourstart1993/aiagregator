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

export async function acknowledgeAlertAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminAcknowledgeAlert(id);
    revalidatePath('/(admin)/admin/alerts', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveAlertAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminResolveAlert(id);
    revalidatePath('/(admin)/admin/alerts', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
