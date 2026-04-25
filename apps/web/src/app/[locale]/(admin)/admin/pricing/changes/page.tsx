import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type TariffChangeLogEntry } from '@/lib/server-api';
import { ChangeLogTable } from '@/components/admin/pricing/ChangeLogTable';

interface SearchParamsShape {
  tariffId?: string;
  userId?: string;
  bundleId?: string;
}

interface Props {
  searchParams: Promise<SearchParamsShape>;
}

async function safeList(filters: SearchParamsShape): Promise<TariffChangeLogEntry[]> {
  try {
    const data = await serverApi.adminListTariffChanges({ ...filters, pageSize: 100 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminChangesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.pricing.changes');
  const changes = await safeList(sp);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <form className="grid grid-cols-1 gap-2 sm:grid-cols-3" action="">
        <input
          name="tariffId"
          defaultValue={sp.tariffId}
          placeholder={t('filterTariff')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="userId"
          defaultValue={sp.userId}
          placeholder={t('filterUser')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="bundleId"
          defaultValue={sp.bundleId}
          placeholder={t('filterBundle')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </form>
      <ChangeLogTable changes={changes} />
    </div>
  );
}
