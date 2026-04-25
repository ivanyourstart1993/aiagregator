'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteUserBundlePriceAction } from '@/app/[locale]/(admin)/admin/pricing/actions';
import type { BundleView, UserBundlePriceView } from '@/lib/server-api';
import { UserBundlePriceForm } from './UserBundlePriceForm';

interface Props {
  userId: string;
  prices: UserBundlePriceView[];
  bundles: BundleView[];
}

function describe(p: UserBundlePriceView, bundles: BundleView[]): string {
  const b = p.bundle ?? bundles.find((x) => x.id === p.bundleId);
  if (!b) return p.bundleId;
  return `${b.providerSlug} / ${b.modelSlug} / ${b.method}`;
}

function fmt(s: string | null | undefined): string {
  return s ?? '—';
}

export function UserBundlePricesTable({ userId, prices, bundles }: Props) {
  const t = useTranslations('admin.pricing.user');
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  function remove(bundleId: string) {
    if (!confirm(t('removeOverride') + '?')) return;
    startTransition(async () => {
      const res = await deleteUserBundlePriceAction(userId, bundleId);
      if (!res.ok) toast.error(t('removeFailed'));
      else toast.success(t('removed'));
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">{t('bundlesTitle')}</CardTitle>
          <CardDescription>{t('bundlesSubtitle')}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          {t('addOverride')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm ? (
          <UserBundlePriceForm
            userId={userId}
            bundles={bundles}
            excludeIds={prices.map((p) => p.bundleId)}
            onSaved={() => setShowForm(false)}
          />
        ) : null}
        {prices.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            {t('noOverrides')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundle</TableHead>
                  <TableHead>base</TableHead>
                  <TableHead>in/tok</TableHead>
                  <TableHead>out/tok</TableHead>
                  <TableHead>per s</TableHead>
                  <TableHead>per img</TableHead>
                  <TableHead>cost</TableHead>
                  <TableHead>bps</TableHead>
                  <TableHead className="w-[1%] text-right">…</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((p) => (
                  <TableRow key={p.bundleId}>
                    <TableCell className="text-xs">{describe(p, bundles)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(p.basePriceUnits)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt(p.inputPerTokenUnits)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt(p.outputPerTokenUnits)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fmt(p.perSecondUnits)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(p.perImageUnits)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(p.providerCostUnits)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.marginBps != null ? p.marginBps : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => remove(p.bundleId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
