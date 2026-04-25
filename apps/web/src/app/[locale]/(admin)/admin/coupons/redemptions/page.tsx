import { getTranslations } from 'next-intl/server';
import {
  ApiError,
  serverApi,
  type AdminRedemptionsFilters,
  type CouponRedemptionView,
} from '@/lib/server-api';
import { RedemptionsTable } from '@/components/admin/coupons/RedemptionsTable';
import { Button } from '@/components/ui/button';

interface SearchParamsShape {
  couponId?: string;
  userId?: string;
  from?: string;
  to?: string;
}

interface Props {
  searchParams: Promise<SearchParamsShape>;
}

async function safeList(filters: AdminRedemptionsFilters): Promise<CouponRedemptionView[]> {
  try {
    const data = await serverApi.adminListAllRedemptions(filters);
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function GlobalRedemptionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.coupons');
  const tCommon = await getTranslations('common');

  const items = await safeList({
    couponId: sp.couponId?.trim() || undefined,
    userId: sp.userId?.trim() || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    pageSize: 100,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('globalRedemptionsTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('globalRedemptionsSubtitle')}</p>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-5" action="">
        <input
          name="couponId"
          defaultValue={sp.couponId}
          placeholder={t('filterCouponId')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="userId"
          defaultValue={sp.userId}
          placeholder={t('filterUserId')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          type="date"
          name="from"
          defaultValue={sp.from}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={sp.to}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <RedemptionsTable items={items} />
    </div>
  );
}
