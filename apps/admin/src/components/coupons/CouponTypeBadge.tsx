'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { CouponType } from '@/lib/server-api';

const VARIANTS: Record<CouponType, 'default' | 'secondary' | 'outline'> = {
  FIXED_AMOUNT: 'default',
  BONUS_MONEY: 'secondary',
  DISCOUNT_METHOD_PERCENT: 'outline',
  DISCOUNT_BUNDLE_AMOUNT: 'outline',
  DISCOUNT_TOPUP: 'secondary',
};

export function CouponTypeBadge({
  type,
  namespace = 'admin.coupons.type',
}: {
  type: CouponType;
  namespace?: string;
}) {
  const t = useTranslations(namespace);
  return <Badge variant={VARIANTS[type]}>{t(type)}</Badge>;
}
