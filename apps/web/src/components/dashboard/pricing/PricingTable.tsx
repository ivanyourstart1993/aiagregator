'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EffectivePriceView } from '@/lib/server-api';
import { PriceComponentsCell } from './PriceComponentsCell';
import { PriceSourceBadge } from './PriceSourceBadge';
import { PricingFilters } from './PricingFilters';

interface Props {
  prices: EffectivePriceView[];
}

function qualifiers(p: EffectivePriceView): string {
  const parts: string[] = [];
  if (p.mode) parts.push(p.mode);
  if (p.resolution) parts.push(p.resolution);
  if (p.durationSeconds != null) parts.push(`${p.durationSeconds}s`);
  if (p.aspectRatio) parts.push(p.aspectRatio);
  return parts.join(' • ');
}

export function PricingTable({ prices }: Props) {
  const t = useTranslations('pricing');
  const tUnit = useTranslations('pricing.unit');
  const [provider, setProvider] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');

  const providers = useMemo(
    () => Array.from(new Set(prices.map((p) => p.provider))).sort(),
    [prices],
  );
  const methods = useMemo(
    () => Array.from(new Set(prices.map((p) => String(p.method)))).sort(),
    [prices],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prices.filter((p) => {
      if (provider && p.provider !== provider) return false;
      if (method && String(p.method) !== method) return false;
      if (q) {
        const hay = `${p.provider} ${p.model} ${p.method} ${qualifiers(p)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [prices, provider, method, search]);

  if (prices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noPrices')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PricingFilters
        providers={providers}
        methods={methods}
        provider={provider}
        method={method}
        search={search}
        onProvider={setProvider}
        onMethod={setMethod}
        onSearch={setSearch}
      />
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('tableProvider')}</TableHead>
              <TableHead>{t('tableModel')}</TableHead>
              <TableHead>{t('tableMethod')}</TableHead>
              <TableHead>{t('tableQualifiers')}</TableHead>
              <TableHead>{t('tableUnit')}</TableHead>
              <TableHead>{t('tableComponents')}</TableHead>
              <TableHead>{t('tableSource')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.bundleKey}>
                <TableCell className="font-medium">{p.provider}</TableCell>
                <TableCell>{p.model}</TableCell>
                <TableCell>{String(p.method)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {qualifiers(p) || '—'}
                </TableCell>
                <TableCell className="text-sm">{tUnit(p.unit)}</TableCell>
                <TableCell className="min-w-[180px]">
                  <PriceComponentsCell price={p} />
                </TableCell>
                <TableCell>
                  <PriceSourceBadge source={p.source} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
