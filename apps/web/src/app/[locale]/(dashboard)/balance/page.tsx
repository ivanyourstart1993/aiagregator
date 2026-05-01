import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type BalanceView, type TransactionsPage } from '@/lib/server-api';
import { BalanceCards } from '@/components/dashboard/billing/BalanceCards';
import { TransactionsTable } from '@/components/dashboard/billing/TransactionsTable';

const EMPTY_BALANCE: BalanceView = {
  available: '0',
  reserved: '0',
  total: '0',
  bonusAvailable: '0',
  currency: 'USD',
};

const EMPTY_PAGE: TransactionsPage = { items: [], total: 0, page: 1, pageSize: 20 };

async function safeBalance(): Promise<BalanceView> {
  try {
    return await serverApi.getBalance();
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_BALANCE;
    return EMPTY_BALANCE;
  }
}

async function safeTransactions(): Promise<TransactionsPage> {
  try {
    return await serverApi.listTransactions({ page: 1, pageSize: 20 });
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_PAGE;
    return EMPTY_PAGE;
  }
}

export default async function BalancePage() {
  const t = await getTranslations('billing');
  const [balance, transactions] = await Promise.all([safeBalance(), safeTransactions()]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/top-up/new">
            <Plus className="h-4 w-4" />
            {t('topUpCta')}
          </Link>
        </Button>
      </header>

      <BalanceCards balance={balance} />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t('transactionsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('transactionsSubtitle')}</p>
        </div>
        <TransactionsTable initialPage={transactions} />
      </section>
    </div>
  );
}
