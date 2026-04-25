'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type BundlePriceInput,
  type TariffSummary,
  type TariffBundlePriceView,
  type UserBundlePriceView,
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

// Tariffs
export async function createTariffAction(input: {
  slug: string;
  name: string;
  description?: string;
  currency?: string;
}): Promise<MutationResult<TariffSummary>> {
  if (!input.slug?.trim()) return { ok: false, code: 'invalid_request' };
  if (!input.name?.trim()) return { ok: false, code: 'invalid_request' };
  try {
    const data = await serverApi.adminCreateTariff({
      slug: input.slug.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      currency: input.currency,
    });
    revalidatePath('/(admin)/admin/pricing/tariffs', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateTariffAction(
  id: string,
  input: { name?: string; description?: string; isActive?: boolean },
): Promise<MutationResult<TariffSummary>> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    const data = await serverApi.adminUpdateTariff(id, input);
    revalidatePath(`/(admin)/admin/pricing/tariffs/${id}`, 'page');
    revalidatePath('/(admin)/admin/pricing/tariffs', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultTariffAction(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminSetDefaultTariff(id);
    revalidatePath('/(admin)/admin/pricing/tariffs', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTariffAction(id: string): Promise<MutationResult> {
  if (!id) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminDeleteTariff(id);
    revalidatePath('/(admin)/admin/pricing/tariffs', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// Tariff bundle prices
export async function upsertTariffPriceAction(
  tariffId: string,
  bundleId: string,
  body: BundlePriceInput,
): Promise<MutationResult<TariffBundlePriceView>> {
  if (!tariffId || !bundleId) return { ok: false, code: 'invalid_request' };
  try {
    const data = await serverApi.adminUpsertTariffPrice(tariffId, bundleId, body);
    revalidatePath(`/(admin)/admin/pricing/tariffs/${tariffId}/prices`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function batchUpsertTariffPricesAction(
  tariffId: string,
  items: Array<BundlePriceInput & { bundleId: string }>,
): Promise<MutationResult<{ count: number }>> {
  if (!tariffId) return { ok: false, code: 'invalid_request' };
  if (!items || items.length === 0) return { ok: false, code: 'invalid_request' };
  try {
    const res = await serverApi.adminBatchUpsertTariffPrices(tariffId, { items });
    revalidatePath(`/(admin)/admin/pricing/tariffs/${tariffId}/prices`, 'page');
    return { ok: true, data: { count: res.items?.length ?? items.length } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTariffPriceAction(
  tariffId: string,
  bundleId: string,
): Promise<MutationResult> {
  if (!tariffId || !bundleId) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminDeleteTariffPrice(tariffId, bundleId);
    revalidatePath(`/(admin)/admin/pricing/tariffs/${tariffId}/prices`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// User pricing
export async function assignTariffAction(
  userId: string,
  tariffId: string,
  reason?: string,
): Promise<MutationResult> {
  if (!userId || !tariffId) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminAssignTariff(userId, { tariffId, reason });
    revalidatePath(`/(admin)/admin/users/${userId}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function unassignTariffAction(userId: string): Promise<MutationResult> {
  if (!userId) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminUnassignTariff(userId);
    revalidatePath(`/(admin)/admin/users/${userId}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertUserBundlePriceAction(
  userId: string,
  bundleId: string,
  body: BundlePriceInput & { reason?: string },
): Promise<MutationResult<UserBundlePriceView>> {
  if (!userId || !bundleId) return { ok: false, code: 'invalid_request' };
  try {
    const data = await serverApi.adminUpsertUserBundlePrice(userId, bundleId, body);
    revalidatePath(`/(admin)/admin/users/${userId}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteUserBundlePriceAction(
  userId: string,
  bundleId: string,
): Promise<MutationResult> {
  if (!userId || !bundleId) return { ok: false, code: 'invalid_request' };
  try {
    await serverApi.adminDeleteUserBundlePrice(userId, bundleId);
    revalidatePath(`/(admin)/admin/users/${userId}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
