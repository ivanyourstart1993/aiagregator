'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { ApiRequestStatus } from '@/lib/server-api';

const VARIANT: Record<ApiRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACCEPTED: 'secondary',
  REJECTED: 'destructive',
  FINALIZED: 'default',
};

export function ApiRequestStatusBadge({ status }: { status: ApiRequestStatus }) {
  const t = useTranslations('requests.status');
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
