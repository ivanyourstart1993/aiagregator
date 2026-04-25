'use server';

import { ApiError, serverApi, type ApiRequestsPage } from '@/lib/server-api';

export interface FetchApiRequestsResult {
  ok: boolean;
  code?: string;
  data?: ApiRequestsPage;
}

export async function fetchApiRequestsAction(
  filters: { page?: number; pageSize?: number },
): Promise<FetchApiRequestsResult> {
  try {
    const data = await serverApi.listApiRequests(filters);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
