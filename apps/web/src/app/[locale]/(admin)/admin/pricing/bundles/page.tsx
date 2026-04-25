import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type BundleView } from '@/lib/server-api';
import { BundlesTable } from '@/components/admin/pricing/BundlesTable';

async function safeList(): Promise<BundleView[]> {
  try {
    const data = await serverApi.adminListBundles({ pageSize: 500 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminBundlesPage() {
  const t = await getTranslations('admin.pricing.bundles');
  const bundles = await safeList();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <BundlesTable bundles={bundles} />
    </div>
  );
}
