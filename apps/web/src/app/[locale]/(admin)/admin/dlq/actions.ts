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

export async function retryDlqAction(
  queue: 'generation' | 'callback',
  jobId: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminRetryDlq(queue, jobId);
    revalidatePath('/(admin)/admin/dlq', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDlqAction(
  queue: 'generation' | 'callback',
  jobId: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteDlq(queue, jobId);
    revalidatePath('/(admin)/admin/dlq', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
