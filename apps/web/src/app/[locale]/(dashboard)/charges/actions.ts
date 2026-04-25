'use server';

import {
  ApiError,
  serverApi,
  type TransactionFiltersInput,
  type TransactionType,
  type TransactionsPage,
} from '@/lib/server-api';

const CHARGE_TYPES: TransactionType[] = [
  'DEBIT',
  'RESERVATION_HOLD',
  'RESERVATION_CAPTURE',
  'RESERVATION_RELEASE',
];

export interface FetchChargesResult {
  ok: boolean;
  code?: string;
  data?: TransactionsPage;
}

export async function fetchChargesAction(
  filters: Omit<TransactionFiltersInput, 'type'>,
): Promise<FetchChargesResult> {
  try {
    const data = await serverApi.listTransactions({ ...filters, type: CHARGE_TYPES });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, code: err.code };
    return { ok: false, code: 'internal_error' };
  }
}

export const CHARGES_TYPES = CHARGE_TYPES;
