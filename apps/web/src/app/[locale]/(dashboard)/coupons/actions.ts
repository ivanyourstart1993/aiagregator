'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, serverApi } from '@/lib/server-api';

export interface CouponMutationResult {
  ok: boolean;
  code?: string;
}

export async function applyCouponAction(rawCode: string): Promise<CouponMutationResult> {
  const code = (rawCode ?? '').trim().toUpperCase();
  if (!code) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.redeemCoupon(code);
    revalidatePath('/(dashboard)/coupons', 'page');
    revalidatePath('/(dashboard)/balance', 'page');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}

export interface ValidateCouponResult {
  ok: boolean;
  code?: string;
  type?: string;
  value?: string;
  previewBonusUnits?: string | null;
  bundleId?: string | null;
  methodCode?: string | null;
}

export async function validateCouponAction(rawCode: string): Promise<ValidateCouponResult> {
  const code = (rawCode ?? '').trim().toUpperCase();
  if (!code) return { ok: false, code: 'invalid_request' };
  try {
    const v = await serverApi.validateCoupon(code);
    return {
      ok: true,
      type: v.type,
      value: v.value,
      previewBonusUnits: v.previewBonusUnits ?? null,
      bundleId: v.bundleId ?? null,
      methodCode: v.methodCode ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
