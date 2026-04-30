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

// ---- ProviderAccount ----

export async function createProviderAccountAction(
  input: CreateProviderAccountInput,
): Promise<MutationResult<ProviderAccountView>> {
  try {
    const data = await serverApi.adminCreateProviderAccount(input);
    revalidatePath('/(panel)/providers/accounts', 'page');
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
    revalidatePath('/(panel)/providers/accounts', 'page');
    revalidatePath(`/(panel)/providers/accounts/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProviderAccountAction(
  id: string,
): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteProviderAccount(id);
    revalidatePath('/(panel)/providers/accounts', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Proxy ----

export async function createProxyAction(
  input: CreateProxyInput,
): Promise<MutationResult<ProxyView>> {
  try {
    const data = await serverApi.adminCreateProxy(input);
    revalidatePath('/(panel)/providers/proxies', 'page');
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
    revalidatePath('/(panel)/providers/proxies', 'page');
    revalidatePath(`/(panel)/providers/proxies/${id}`, 'page');
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProxyAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteProxy(id);
    revalidatePath('/(panel)/providers/proxies', 'page');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
