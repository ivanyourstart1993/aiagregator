import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type ProviderAdminView,
  type RateCardView,
} from '@/lib/server-api';
import { RateCardsTable } from '@/components/admin/rate-cards/RateCardsTable';

interface Props {
  searchParams: Promise<{ providerId?: string; active?: string }>;
}

async function safeProviders(): Promise<ProviderAdminView[]> {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeCards(filters: {
  providerId?: string;
  active?: boolean;
}): Promise<RateCardView[]> {
  try {
    const data = await serverApi.adminListRateCards({ ...filters, pageSize: 200 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminRateCardsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.rateCards');
  const tCommon = await getTranslations('common');
  const [providers, items] = await Promise.all([
    safeProviders(),
    safeCards({
      providerId: sp.providerId || undefined,
      active: sp.active === '1' ? true : undefined,
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/rate-cards/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-3" action="">
        <select
          name="providerId"
          defaultValue={sp.providerId ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllProviders')}</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.publicName}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={sp.active === '1'}
            className="h-4 w-4"
          />
          {t('filterActive')}
        </label>
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <RateCardsTable items={items} />
    </div>
  );
}
