import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type AdminCouponsFilters,
  type CouponStatus,
  type CouponType,
  type CouponView,
} from '@/lib/server-api';
import { CouponsTable } from '@/components/admin/coupons/CouponsTable';

interface SearchParamsShape {
  type?: string;
  status?: string;
  q?: string;
}

interface Props {
  searchParams: Promise<SearchParamsShape>;
}

const TYPES: CouponType[] = [
  'FIXED_AMOUNT',
  'BONUS_MONEY',
  'DISCOUNT_METHOD_PERCENT',
  'DISCOUNT_BUNDLE_AMOUNT',
  'DISCOUNT_TOPUP',
];
const STATUSES: CouponStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'EXHAUSTED'];

async function safeList(filters: AdminCouponsFilters): Promise<CouponView[]> {
  try {
    const data = await serverApi.adminListCoupons(filters);
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminCouponsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.coupons');
  const tType = await getTranslations('admin.coupons.type');
  const tStatus = await getTranslations('admin.coupons.status');
  const tCommon = await getTranslations('common');

  const filters: AdminCouponsFilters = {
    pageSize: 100,
    type: TYPES.includes(sp.type as CouponType) ? (sp.type as CouponType) : undefined,
    status: STATUSES.includes(sp.status as CouponStatus) ? (sp.status as CouponStatus) : undefined,
    q: sp.q?.trim() || undefined,
  };
  const coupons = await safeList(filters);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/coupons/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-4" action="">
        <select
          name="type"
          defaultValue={sp.type ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllTypes')}</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {tType(type)}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder={t('searchPlaceholder')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:col-span-1"
        />
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <CouponsTable coupons={coupons} />
    </div>
  );
}
