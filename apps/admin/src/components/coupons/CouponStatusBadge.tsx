'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { CouponStatus } from '@/lib/server-api';

const VARIANTS: Record<CouponStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  PAUSED: 'secondary',
  EXPIRED: 'destructive',
  EXHAUSTED: 'destructive',
};

export function CouponStatusBadge({ status }: { status: CouponStatus }) {
  const t = useTranslations('admin.coupons.status');
  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
