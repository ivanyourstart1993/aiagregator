import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type ProxyView } from '@/lib/server-api';
import { ProxiesTable } from '@/components/admin/providers/ProxiesTable';

interface Props {
  searchParams: Promise<{ country?: string; region?: string }>;
}

async function safeProxies(): Promise<ProxyView[]> {
  try {
    const data = await serverApi.adminListProxies();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminProxiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.providers.proxies');
  const tCommon = await getTranslations('common');
  const all = await safeProxies();
  const filtered = all.filter((p) => {
    if (sp.country && p.country !== sp.country) return false;
    if (sp.region && p.region !== sp.region) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/providers/proxies/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-3" action="">
        <input
          name="country"
          defaultValue={sp.country ?? ''}
          placeholder={t('filterCountry')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="region"
          defaultValue={sp.region ?? ''}
          placeholder={t('filterRegion')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <ProxiesTable items={filtered} />
    </div>
  );
}
