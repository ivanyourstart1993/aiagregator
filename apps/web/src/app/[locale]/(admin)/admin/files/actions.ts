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

export async function deleteFileNowAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteFileNow(id);
    revalidatePath('/(admin)/admin/files', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
