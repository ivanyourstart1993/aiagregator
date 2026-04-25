import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type EffectivePriceView, type TariffSummary } from '@/lib/server-api';
import { PricingTable } from '@/components/dashboard/pricing/PricingTable';
import { TariffHeader } from '@/components/dashboard/pricing/TariffHeader';

async function safePrices(): Promise<EffectivePriceView[]> {
  try {
    return await serverApi.getPricing();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeTariff(): Promise<TariffSummary | null> {
  try {
    return await serverApi.getMyTariff();
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function PricingPage() {
  const t = await getTranslations('pricing');
  const [prices, tariff] = await Promise.all([safePrices(), safeTariff()]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <TariffHeader tariff={tariff} />

      <PricingTable prices={prices} />
    </div>
  );
}
