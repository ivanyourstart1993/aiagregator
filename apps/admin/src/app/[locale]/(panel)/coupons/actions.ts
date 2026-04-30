'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type CouponView,
  type CreateCouponInput,
  type UpdateCouponInput,
} from '@/lib/server-api';

export interface AdminCouponMutationResult<T = unknown> {
  ok: boolean;
  code?: string;
  data?: T;
}

function fail<T = unknown>(err: unknown): AdminCouponMutationResult<T> {
  if (err instanceof ApiError) return { ok: false, code: err.code };
  return { ok: false, code: 'internal_error' };
}

export async function createCouponAction(
  input: CreateCouponInput,
): Promise<AdminCouponMutationResult<CouponView>> {
  if (!input.code?.trim()) return { ok: false, code: 'invalid_request' };
  try {
    const data = await serverApi.adminCreateCoupon({
      ...input,
      code: input.code.trim().toUpperCase(),
    });
    revalidatePath('/(panel)/coupons', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCouponAction(
  id: string,
  input: UpdateCouponInput,
): Promise<AdminCouponMutationResult<CouponView>> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    const data = await serverApi.adminUpdateCoupon(id, input);
    revalidatePath('/(panel)/coupons', 'page');
    revalidatePath(`/(panel)/coupons/${id}/edit`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCouponAction(id: string): Promise<AdminCouponMutationResult> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminDeleteCoupon(id);
    revalidatePath('/(panel)/coupons', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
