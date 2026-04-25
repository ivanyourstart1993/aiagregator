'use server';

import { ApiError, serverApi, type TransactionFiltersInput, type TransactionsPage } from '@/lib/server-api';

export interface FetchTransactionsResult {
  ok: boolean;
  code?: string;
  data?: TransactionsPage;
}

export async function fetchTransactionsAction(
  filters: TransactionFiltersInput,
): Promise<FetchTransactionsResult> {
  try {
    const data = await serverApi.listTransactions(filters);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}
