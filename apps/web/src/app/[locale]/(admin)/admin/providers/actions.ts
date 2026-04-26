'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type CreateProviderAccountInput,
  type CreateProxyInput,
  type ProviderAccountView,
  type ProxyView,
  type UpdateProviderAccountInput,
  type UpdateProxyInput,
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

export async function createProviderAccountAction(
  input: CreateProviderAccountInput,
): Promise<MutationResult<ProviderAccountView>> {
  try {
    const data = await serverApi.adminCreateProviderAccount(input);
    revalidatePath('/(admin)/admin/providers/accounts', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateProviderAccountAction(
  id: string,
  input: UpdateProviderAccountInput,
): Promise<MutationResult<ProviderAccountView>> {
  try {
    const data = await serverApi.adminUpdateProviderAccount(id, input);
    revalidatePath('/(admin)/admin/providers/accounts', 'page');
    revalidatePath(`/(admin)/admin/providers/accounts/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProviderAccountAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteProviderAccount(id);
    revalidatePath('/(admin)/admin/providers/accounts', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleProviderAccountAction(
  id: string,
  enable: boolean,
): Promise<MutationResult> {
  try {
    if (enable) await serverApi.adminEnableProviderAccount(id);
    else await serverApi.adminDisableProviderAccount(id);
    revalidatePath('/(admin)/admin/providers/accounts', 'page');
    revalidatePath(`/(admin)/admin/providers/accounts/${id}`, 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createProxyAction(
  input: CreateProxyInput,
): Promise<MutationResult<ProxyView>> {
  try {
    const data = await serverApi.adminCreateProxy(input);
    revalidatePath('/(admin)/admin/providers/proxies', 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateProxyAction(
  id: string,
  input: UpdateProxyInput,
): Promise<MutationResult<ProxyView>> {
  try {
    const data = await serverApi.adminUpdateProxy(id, input);
    revalidatePath('/(admin)/admin/providers/proxies', 'page');
    revalidatePath(`/(admin)/admin/providers/proxies/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProxyAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteProxy(id);
    revalidatePath('/(admin)/admin/providers/proxies', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
