'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, serverApi } from '@/lib/server-api';
import { dollarsToCents } from '@/lib/money';

export interface AdminMutationResult {
  ok: boolean;
  code?: string;
}

function centsToNanoString(cents: number): string {
  // 1 cent = 1_000_000 nano-USD. Returned as a base-10 string.
  return (BigInt(cents) * 1_000_000n).toString();
}

interface BaseInput {
  userId: string;
  amountUsd: number;
  reason: string;
  idempotencyKey?: string;
}

function validateBase(input: BaseInput): string | null {
  if (!input.userId) return 'invalid_request';
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) return 'invalid_amount';
  if (!input.reason || !input.reason.trim()) return 'invalid_reason';
  return null;
}

async function callMutation(
  fn: (
    userId: string,
    body: { amountUnits: string; reason: string; idempotencyKey?: string },
  ) => Promise<unknown>,
  input: BaseInput,
): Promise<AdminMutationResult> {
  const err = validateBase(input);
  if (err) return { ok: false, code: err };
  const cents = dollarsToCents(input.amountUsd);
  const body = {
    amountUnits: centsToNanoString(cents),
    reason: input.reason.trim(),
    idempotencyKey: input.idempotencyKey,
  };
  try {
    await fn(input.userId, body);
    revalidatePath(`/(admin)/admin/users/${input.userId}`, 'page');
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, code: e.code };
    return { ok: false, code: 'internal_error' };
  }
}

export const creditUserAction = (input: BaseInput) =>
  callMutation((u, b) => serverApi.adminCredit(u, b), input);

export const debitUserAction = (input: BaseInput) =>
  callMutation((u, b) => serverApi.adminDebit(u, b), input);

export const correctUserAction = (input: BaseInput) =>
  callMutation((u, b) => serverApi.adminCorrect(u, b), input);

export const grantBonusAction = (input: BaseInput) =>
  callMutation((u, b) => serverApi.adminBonus(u, b), input);

export const reserveForUserAction = (input: BaseInput) =>
  callMutation((u, b) => serverApi.adminReserve(u, b), input);

export type CaptureReleaseResult = AdminMutationResult;

export async function captureReservationAction(input: {
  userId: string;
  reservationId: string;
  captureUsd?: number;
  idempotencyKey?: string;
}): Promise<CaptureReleaseResult> {
  if (!input.reservationId) return { ok: false, code: 'invalid_request' };
  const body: { captureUnits?: string; idempotencyKey?: string } = {
    idempotencyKey: input.idempotencyKey,
  };
  if (input.captureUsd != null) {
    if (!Number.isFinite(input.captureUsd) || input.captureUsd < 0) {
      return { ok: false, code: 'invalid_amount' };
    }
    body.captureUnits = centsToNanoString(dollarsToCents(input.captureUsd));
  }
  try {
    await serverApi.adminCapture(input.reservationId, body);
    revalidatePath(`/(admin)/admin/users/${input.userId}`, 'page');
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, code: e.code };
    return { ok: false, code: 'internal_error' };
  }
}

export async function releaseReservationAction(input: {
  userId: string;
  reservationId: string;
  idempotencyKey?: string;
}): Promise<CaptureReleaseResult> {
  if (!input.reservationId) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminRelease(input.reservationId, { idempotencyKey: input.idempotencyKey });
    revalidatePath(`/(admin)/admin/users/${input.userId}`, 'page');
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, code: e.code };
    return { ok: false, code: 'internal_error' };
  }
}
