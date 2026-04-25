'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PriceSource } from '@/lib/server-api';

interface Props {
  source: PriceSource;
}

export function PriceSourceBadge({ source }: Props) {
  const t = useTranslations('pricing.source');
  const cls =
    source === 'USER_BUNDLE_OVERRIDE'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : source === 'USER_TARIFF'
        ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300'
        : 'border-muted bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={cn('font-medium', cls)}>
      {t(source)}
    </Badge>
  );
}
