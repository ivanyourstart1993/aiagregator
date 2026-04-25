import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type BundleView,
  type TariffBundlePriceView,
} from '@/lib/server-api';
import { BundlePricesGrid } from '@/components/admin/pricing/BundlePricesGrid';

interface Props {
  params: Promise<{ tariffId: string }>;
}

async function safePrices(id: string): Promise<TariffBundlePriceView[]> {
  try {
    return await serverApi.adminListTariffPrices(id);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeBundles(): Promise<BundleView[]> {
  try {
    const data = await serverApi.adminListBundles({ active: true, pageSize: 500 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function TariffPricesPage({ params }: Props) {
  const { tariffId } = await params;
  const t = await getTranslations('admin.pricing.prices');
  const tCommon = await getTranslations('common');

  let tariff;
  try {
    tariff = await serverApi.adminGetTariff(tariffId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }

  const [prices, bundles] = await Promise.all([safePrices(tariffId), safeBundles()]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/pricing/tariffs">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('title')} — <span className="text-muted-foreground">{tariff.name}</span>
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <BundlePricesGrid tariffId={tariffId} prices={prices} bundles={bundles} />
    </div>
  );
}
