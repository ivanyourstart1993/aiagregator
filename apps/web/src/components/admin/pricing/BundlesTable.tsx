'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BundleView } from '@/lib/server-api';

interface Props {
  bundles: BundleView[];
}

function quals(b: BundleView): string {
  return [b.mode, b.resolution, b.durationSeconds ? `${b.durationSeconds}s` : null, b.aspectRatio]
    .filter(Boolean)
    .join(' • ');
}

export function BundlesTable({ bundles }: Props) {
  const t = useTranslations('admin.pricing.bundles');

  if (bundles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noBundles')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableProvider')}</TableHead>
            <TableHead>{t('tableModel')}</TableHead>
            <TableHead>{t('tableMethod')}</TableHead>
            <TableHead>{t('tableQualifiers')}</TableHead>
            <TableHead>{t('tableUnit')}</TableHead>
            <TableHead>{t('tableActive')}</TableHead>
            <TableHead>{t('tableKey')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bundles.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.providerSlug}</TableCell>
              <TableCell>{b.modelSlug}</TableCell>
              <TableCell>{b.method}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{quals(b) || '—'}</TableCell>
              <TableCell className="text-xs">{b.unit}</TableCell>
              <TableCell>
                {b.isActive ? <Badge variant="outline">on</Badge> : <Badge variant="secondary">off</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {b.bundleKey.slice(0, 16)}…
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
