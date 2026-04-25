'use server';

import { ApiError, serverApi, type TransactionFiltersInput, type TransactionsPage } from '@/lib/server-api';

export interface AdminFetchTransactionsResult {
  ok: boolean;
  code?: string;
  data?: TransactionsPage;
}

export async function adminFetchTransactionsAction(
  filters: TransactionFiltersInput,
): Promise<AdminFetchTransactionsResult> {
  try {
    const data = await serverApi.adminListTransactions(filters);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
