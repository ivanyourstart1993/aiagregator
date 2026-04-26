'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type CreateExportInput,
  type ExportView,
} from '@/lib/server-api';

export interface MutationResult<T = unknown> {
  ok: boolean;
  code?: string;
  data?: T;
}

function fail<T = unknown>(err: unknown): MutationResult<T> {
  if (err instanceof ApiError) return { ok: false, code: err.code };
  return { ok: false, code: 'internal_error' };
}

export async function createExportAction(
  input: CreateExportInput,
): Promise<MutationResult<ExportView>> {
  try {
    const data = await serverApi.createExport(input);
    revalidatePath('/(dashboard)/exports', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
