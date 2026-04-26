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

export async function updateSettingAction(
  key: string,
  value: unknown,
  comment?: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminUpdateSetting(key, { value, comment });
    revalidatePath('/(admin)/admin/settings', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function pauseGenerationAction(paused: boolean): Promise<MutationResult> {
  try {
    await serverApi.adminPauseGeneration(paused);
    revalidatePath('/(admin)/admin/settings', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function pauseProviderAction(code: string, paused: boolean): Promise<MutationResult> {
  try {
    await serverApi.adminPauseProvider(code, paused);
    revalidatePath('/(admin)/admin/settings', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function pauseBundleAction(key: string, paused: boolean): Promise<MutationResult> {
  try {
    await serverApi.adminPauseBundle(key, paused);
    revalidatePath('/(admin)/admin/settings', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
