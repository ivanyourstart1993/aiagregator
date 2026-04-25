'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { TransactionType } from '@/lib/server-api';

interface Props {
  type: TransactionType;
}

const VARIANT: Record<TransactionType, BadgeProps['variant']> = {
  DEPOSIT: 'default',
  DEBIT: 'destructive',
  REFUND: 'secondary',
  CORRECTION: 'outline',
  BONUS_GRANT: 'default',
  BONUS_CORRECTION: 'outline',
  COUPON_DISCOUNT: 'secondary',
  RESERVATION_HOLD: 'outline',
  RESERVATION_RELEASE: 'secondary',
  RESERVATION_CAPTURE: 'destructive',
};

export function TransactionTypeBadge({ type }: Props) {
  const t = useTranslations('billing.type');
  return <Badge variant={VARIANT[type]}>{t(type)}</Badge>;
}
