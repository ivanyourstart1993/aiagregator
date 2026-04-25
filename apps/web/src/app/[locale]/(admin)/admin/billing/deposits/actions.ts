'use server';

import { ApiError, serverApi, type DepositStatus, type DepositsPage } from '@/lib/server-api';

export interface AdminFetchDepositsResult {
  ok: boolean;
  code?: string;
  data?: DepositsPage;
}

export async function adminFetchDepositsAction(filters: {
  userId?: string;
  status?: DepositStatus;
  page?: number;
  pageSize?: number;
}): Promise<AdminFetchDepositsResult> {
  try {
    const data = await serverApi.adminListDeposits(filters);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
