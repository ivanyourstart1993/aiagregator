'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNanoToUSD } from '@/lib/money';
import type { PerBundleRow } from '@/lib/server-api';

type SortKey = 'revenue' | 'cost' | 'margin' | 'requests';

export function PerBundleTable({ rows }: { rows: PerBundleRow[] }) {
  const t = useTranslations('admin.analytics');
  const [sort, setSort] = useState<SortKey>('revenue');

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-8 text-center text-sm text-muted-foreground">
        {t('noData')}
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    const get = (r: PerBundleRow) => {
      switch (sort) {
        case 'revenue':
          return Number(r.revenueUnits || '0');
        case 'cost':
          return Number(r.costUnits || '0');
        case 'margin':
          return Number(r.marginUnits || '0');
        case 'requests':
          return r.requestsCount;
      }
    };
    return get(b) - get(a);
  });

  function H({ k, label }: { k: SortKey; label: string }) {
    return (
      <TableHead>
        <button
          type="button"
          onClick={() => setSort(k)}
          className={`text-left text-xs ${sort === k ? 'font-semibold' : ''}`}
        >
          {label}
          {sort === k ? ' ↓' : ''}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableBundle')}</TableHead>
            <H k="revenue" label={t('tableRevenue')} />
            <H k="cost" label={t('tableCost')} />
            <H k="margin" label={t('tableMargin')} />
            <H k="requests" label={t('tableRequests')} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.bundleKey}>
              <TableCell className="font-mono text-xs">{r.bundleKey}</TableCell>
              <TableCell className="font-mono text-xs">{formatNanoToUSD(r.revenueUnits)}</TableCell>
              <TableCell className="font-mono text-xs">
                {r.costUnits ? formatNanoToUSD(r.costUnits) : '—'}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.marginUnits ? formatNanoToUSD(r.marginUnits) : '—'}
              </TableCell>
              <TableCell className="text-sm">{r.requestsCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
