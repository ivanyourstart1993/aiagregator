import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type CouponRedemptionView,
  type CouponView,
} from '@/lib/server-api';
import { RedemptionsTable } from '@/components/coupons/RedemptionsTable';

interface Props {
  params: Promise<{ couponId: string }>;
}

async function safeData(
  id: string,
): Promise<{ coupon: CouponView | null; items: CouponRedemptionView[] }> {
  try {
    const [coupon, page] = await Promise.all([
      serverApi.adminGetCoupon(id).catch(() => null),
      serverApi.adminListCouponRedemptions(id, { pageSize: 100 }),
    ]);
    return { coupon, items: page.items ?? [] };
  } catch (err) {
    if (err instanceof ApiError) return { coupon: null, items: [] };
    return { coupon: null, items: [] };
  }
}

export default async function CouponRedemptionsPage({ params }: Props) {
  const { couponId } = await params;
  const t = await getTranslations('admin.coupons');
  const tCommon = await getTranslations('common');
  const { coupon, items } = await safeData(couponId);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/coupons">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('redemptionsTitle')}
          {coupon ? (
            <span className="ml-2 font-mono text-base text-muted-foreground">{coupon.code}</span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">{t('redemptionsSubtitle')}</p>
      </header>
      <RedemptionsTable items={items} />
    </div>
  );
}
