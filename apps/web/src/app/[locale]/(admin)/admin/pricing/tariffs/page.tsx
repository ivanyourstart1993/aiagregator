import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type TariffSummary } from '@/lib/server-api';
import { TariffsTable } from '@/components/admin/pricing/TariffsTable';

async function safeListTariffs(): Promise<TariffSummary[]> {
  try {
    const data = await serverApi.adminListTariffs({ pageSize: 100 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminTariffsPage() {
  const t = await getTranslations('admin.pricing.tariffs');
  const tariffs = await safeListTariffs();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/pricing/tariffs/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>
      <TariffsTable tariffs={tariffs} />
    </div>
  );
}
