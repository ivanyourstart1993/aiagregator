'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { ApiError, serverApi, type DepositView } from '@/lib/server-api';
import { dollarsToCents } from '@/lib/money';

const invoiceSchema = z.object({
  amountUsd: z.number().positive().min(5).max(10000),
  couponCode: z.string().trim().min(1).max(64).optional(),
});

export interface CreateInvoiceResult {
  ok: boolean;
  code?: string;
  depositId?: string;
  payUrl?: string;
}

export async function createInvoiceAction(input: {
  amountUsd: number;
  couponCode?: string;
}): Promise<CreateInvoiceResult> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid_request' };
  const cents = dollarsToCents(parsed.data.amountUsd);
  if (cents < 500 || cents > 1_000_000) return { ok: false, code: 'invalid_amount' };
  const coupon = parsed.data.couponCode?.toUpperCase();
  try {
    const res = await serverApi.createTopUpInvoice(cents, coupon);
    revalidatePath('/(dashboard)/top-up', 'page');
    return { ok: true, depositId: res.depositId, payUrl: res.payUrl };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}

export interface FetchDepositResult {
  ok: boolean;
  code?: string;
  deposit?: DepositView;
}

export async function fetchDepositAction(id: string): Promise<FetchDepositResult> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    const deposit = await serverApi.getDeposit(id);
    return { ok: true, deposit };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
