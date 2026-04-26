'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type CreateRateCardInput,
  type RateCardView,
  type UpdateRateCardInput,
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

export async function createRateCardAction(
  input: CreateRateCardInput,
): Promise<MutationResult<RateCardView>> {
  try {
    const data = await serverApi.adminCreateRateCard(input);
    revalidatePath('/(admin)/admin/rate-cards', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRateCardAction(
  id: string,
  input: UpdateRateCardInput,
): Promise<MutationResult<RateCardView>> {
  try {
    const data = await serverApi.adminUpdateRateCard(id, input);
    revalidatePath('/(admin)/admin/rate-cards', 'page');
    revalidatePath(`/(admin)/admin/rate-cards/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRateCardAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteRateCard(id);
    revalidatePath('/(admin)/admin/rate-cards', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
