import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type TransactionsPage, type TransactionType } from '@/lib/server-api';
import { ChargesTable } from '@/components/dashboard/charges/ChargesTable';

const EMPTY_PAGE: TransactionsPage = { items: [], total: 0, page: 1, pageSize: 20 };

const CHARGE_TYPES: TransactionType[] = [
  'DEBIT',
  'RESERVATION_HOLD',
  'RESERVATION_CAPTURE',
  'RESERVATION_RELEASE',
];

async function safeCharges(): Promise<TransactionsPage> {
  try {
    return await serverApi.listTransactions({ page: 1, pageSize: 20, type: CHARGE_TYPES });
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_PAGE;
    return EMPTY_PAGE;
  }
}

export default async function ChargesPage() {
  const t = await getTranslations('charges');
  const data = await safeCharges();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ChargesTable initialPage={data} />
    </div>
  );
}
