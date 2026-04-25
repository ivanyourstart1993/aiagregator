import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, serverApi, type CouponRedemptionView } from '@/lib/server-api';
import { ApplyCouponForm } from '@/components/dashboard/coupons/ApplyCouponForm';
import { CouponHistoryTable } from '@/components/dashboard/coupons/CouponHistoryTable';

async function safeHistory(): Promise<CouponRedemptionView[]> {
  try {
    const data = await serverApi.listCouponHistory({ page: 1, pageSize: 20 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function CouponsPage() {
  const t = await getTranslations('coupons');
  const items = await safeHistory();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('applyTitle')}</CardTitle>
          <CardDescription>{t('applySubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplyCouponForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t('historyTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('historySubtitle')}</p>
        </div>
        <CouponHistoryTable items={items} />
      </section>
    </div>
  );
}
