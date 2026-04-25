import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type DepositView } from '@/lib/server-api';
import { AdminDepositsFilters } from '@/components/admin/billing/AdminDepositsFilters';

async function safeListDeposits(): Promise<DepositView[]> {
  try {
    const data = await serverApi.adminListDeposits({ page: 1, pageSize: 50 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminDepositsPage() {
  const t = await getTranslations('admin.billing');
  const deposits = await safeListDeposits();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('depositsTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('depositsSubtitle')}</p>
      </header>

      <AdminDepositsFilters initialDeposits={deposits} />
    </div>
  );
}
