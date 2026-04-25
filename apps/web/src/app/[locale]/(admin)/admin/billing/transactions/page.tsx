import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type TransactionsPage } from '@/lib/server-api';
import { TransactionsTable } from '@/components/dashboard/billing/TransactionsTable';

const EMPTY_PAGE: TransactionsPage = { items: [], total: 0, page: 1, pageSize: 50 };

async function safeListTransactions(): Promise<TransactionsPage> {
  try {
    return await serverApi.adminListTransactions({ page: 1, pageSize: 50 });
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_PAGE;
    return EMPTY_PAGE;
  }
}

export default async function AdminTransactionsPage() {
  const t = await getTranslations('admin.billing');
  const data = await safeListTransactions();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('transactionsTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('transactionsSubtitle')}</p>
      </header>

      <TransactionsTable initialPage={data} scope="admin" showUserId />
    </div>
  );
}
