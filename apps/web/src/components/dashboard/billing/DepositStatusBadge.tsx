'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { DepositStatus } from '@/lib/server-api';

const VARIANT: Record<DepositStatus, BadgeProps['variant']> = {
  CREATED: 'outline',
  PENDING_PAYMENT: 'secondary',
  PAID: 'default',
  FAILED: 'destructive',
  EXPIRED: 'outline',
  REFUNDED: 'secondary',
};

interface Props {
  status: DepositStatus;
}

export function DepositStatusBadge({ status }: Props) {
  const t = useTranslations('topup.status');
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
