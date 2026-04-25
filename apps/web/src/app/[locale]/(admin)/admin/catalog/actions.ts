'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  serverApi,
  type CreateMethodInput,
  type CreateModelInput,
  type CreateProviderInput,
  type MethodAdminView,
  type ModelAdminView,
  type ProviderAdminView,
  type UpdateMethodInput,
  type UpdateModelInput,
  type UpdateProviderInput,
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

function bust() {
  revalidatePath('/(admin)/admin/catalog', 'layout');
}

export async function createProviderAction(
  input: CreateProviderInput,
): Promise<MutationResult<ProviderAdminView>> {
  try {
    const data = await serverApi.adminCreateProvider(input);
    bust();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateProviderAction(
  id: string,
  input: UpdateProviderInput,
): Promise<MutationResult<ProviderAdminView>> {
  try {
    const data = await serverApi.adminUpdateProvider(id, input);
    bust();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProviderAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteProvider(id);
    bust();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createModelAction(
  providerId: string,
  input: CreateModelInput,
): Promise<MutationResult<ModelAdminView>> {
  try {
    const data = await serverApi.adminCreateModel(providerId, input);
    bust();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateModelAction(
  id: string,
  input: UpdateModelInput,
): Promise<MutationResult<ModelAdminView>> {
  try {
    const data = await serverApi.adminUpdateModel(id, input);
    bust();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteModelAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteModel(id);
    bust();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createMethodAction(
  modelId: string,
  input: CreateMethodInput,
): Promise<MutationResult<MethodAdminView>> {
  try {
    const data = await serverApi.adminCreateMethod(modelId, input);
    bust();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMethodAction(
  id: string,
  input: UpdateMethodInput,
): Promise<MutationResult<MethodAdminView>> {
  try {
    const data = await serverApi.adminUpdateMethod(id, input);
    bust();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMethodAction(id: string): Promise<MutationResult> {
  try {
    await serverApi.adminDeleteMethod(id);
    bust();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setMethodAvailabilityAction(
  id: string,
  body: { scope: 'ALL_USERS' | 'WHITELIST'; userIds: string[] },
): Promise<MutationResult> {
  try {
    await serverApi.adminSetMethodAvailability(id, body);
    bust();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
