import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type DepositView } from '@/lib/server-api';
import { DepositsList } from '@/components/dashboard/billing/DepositsList';

async function safeListDeposits(): Promise<DepositView[]> {
  try {
    const res = await serverApi.listDeposits();
    if (Array.isArray(res)) return res;
    return res.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function TopUpPage() {
  const t = await getTranslations('topup');
  const deposits = await safeListDeposits();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/top-up/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>

      <DepositsList deposits={deposits} />
    </div>
  );
}
