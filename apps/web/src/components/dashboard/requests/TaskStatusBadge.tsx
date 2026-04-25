'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { TaskStatus } from '@/lib/server-api';

const VARIANT: Record<TaskStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  PROCESSING: 'secondary',
  SUCCEEDED: 'default',
  FAILED: 'destructive',
  CANCELLED: 'outline',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const t = useTranslations('requests.taskStatus');
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
