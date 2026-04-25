'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  batchUpsertTariffPricesAction,
  deleteTariffPriceAction,
  upsertTariffPriceAction,
} from '@/app/[locale]/(admin)/admin/pricing/actions';
import {
  PriceImportDialog,
  type ImportedPriceRow,
} from './PriceImportDialog';
import { BundlePicker } from './BundlePicker';
import type {
  BundlePriceInput,
  BundleView,
  TariffBundlePriceView,
} from '@/lib/server-api';

interface Props {
  tariffId: string;
  prices: TariffBundlePriceView[];
  bundles: BundleView[];
}

interface Row {
  bundleId: string;
  bundle?: BundleView;
  basePriceUnits: string;
  inputPerTokenUnits: string;
  outputPerTokenUnits: string;
  perSecondUnits: string;
  perImageUnits: string;
  providerCostUnits: string;
  marginBps: string;
  dirty: boolean;
  isNew: boolean;
}

function priceRowFromView(p: TariffBundlePriceView, bundle: BundleView | undefined): Row {
  return {
    bundleId: p.bundleId,
    bundle,
    basePriceUnits: p.basePriceUnits ?? '',
    inputPerTokenUnits: p.inputPerTokenUnits ?? '',
    outputPerTokenUnits: p.outputPerTokenUnits ?? '',
    perSecondUnits: p.perSecondUnits ?? '',
    perImageUnits: p.perImageUnits ?? '',
    providerCostUnits: p.providerCostUnits ?? '',
    marginBps: p.marginBps != null ? String(p.marginBps) : '',
    dirty: false,
    isNew: false,
  };
}

function rowToInput(r: Row): BundlePriceInput {
  const num = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  const intOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  return {
    basePriceUnits: num(r.basePriceUnits),
    inputPerTokenUnits: num(r.inputPerTokenUnits),
    outputPerTokenUnits: num(r.outputPerTokenUnits),
    perSecondUnits: num(r.perSecondUnits),
    perImageUnits: num(r.perImageUnits),
    providerCostUnits: num(r.providerCostUnits),
    marginBps: intOrNull(r.marginBps),
  };
}

function describe(b: BundleView | undefined, fallbackId: string): string {
  if (!b) return fallbackId;
  const quals = [
    b.mode,
    b.resolution,
    b.durationSeconds ? `${b.durationSeconds}s` : null,
    b.aspectRatio,
  ]
    .filter(Boolean)
    .join('/');
  const head = `${b.providerSlug} / ${b.modelSlug} / ${b.method}`;
  return quals ? `${head} (${quals})` : head;
}

export function BundlePricesGrid({ tariffId, prices, bundles }: Props) {
  const t = useTranslations('admin.pricing.prices');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();

  const bundlesById = useMemo(() => {
    const m = new Map<string, BundleView>();
    for (const b of bundles) m.set(b.id, b);
    return m;
  }, [bundles]);

  const [rows, setRows] = useState<Row[]>(() =>
    prices.map((p) => priceRowFromView(p, bundlesById.get(p.bundleId))),
  );
  const [pickerValue, setPickerValue] = useState('');

  const dirtyCount = rows.filter((r) => r.dirty || r.isNew).length;

  function update(idx: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)),
    );
  }

  function addBundle(bundleId: string) {
    if (!bundleId) return;
    if (rows.some((r) => r.bundleId === bundleId)) return;
    setRows((prev) => [
      ...prev,
      {
        bundleId,
        bundle: bundlesById.get(bundleId),
        basePriceUnits: '',
        inputPerTokenUnits: '',
        outputPerTokenUnits: '',
        perSecondUnits: '',
        perImageUnits: '',
        providerCostUnits: '',
        marginBps: '',
        dirty: true,
        isNew: true,
      },
    ]);
    setPickerValue('');
  }

  function discard() {
    setRows(prices.map((p) => priceRowFromView(p, bundlesById.get(p.bundleId))));
  }

  function saveAll() {
    const dirty = rows.filter((r) => r.dirty || r.isNew);
    if (dirty.length === 0) return;
    startTransition(async () => {
      const items = dirty.map((r) => ({ bundleId: r.bundleId, ...rowToInput(r) }));
      const res = await batchUpsertTariffPricesAction(tariffId, items);
      if (!res.ok) {
        toast.error(t('saveFailed'));
        return;
      }
      toast.success(t('saved'));
      setRows((prev) => prev.map((r) => ({ ...r, dirty: false, isNew: false })));
    });
  }

  function saveRow(idx: number) {
    const r = rows[idx];
    startTransition(async () => {
      const res = await upsertTariffPriceAction(tariffId, r.bundleId, rowToInput(r));
      if (!res.ok) {
        toast.error(t('saveFailed'));
        return;
      }
      toast.success(t('saved'));
      setRows((prev) =>
        prev.map((row, i) => (i === idx ? { ...row, dirty: false, isNew: false } : row)),
      );
    });
  }

  function deleteRow(idx: number) {
    const r = rows[idx];
    if (r.isNew) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const res = await deleteTariffPriceAction(tariffId, r.bundleId);
      if (!res.ok) {
        toast.error(t('deleteFailed'));
        return;
      }
      toast.success(t('deleted'));
      setRows((prev) => prev.filter((_, i) => i !== idx));
    });
  }

  function handleImport(items: ImportedPriceRow[]) {
    startTransition(async () => {
      const res = await batchUpsertTariffPricesAction(tariffId, items);
      if (!res.ok) {
        toast.error(t('importFailed'));
        return;
      }
      toast.success(t('importDone', { count: res.data?.count ?? items.length }));
      // Merge into rows: replace if existing, else append
      setRows((prev) => {
        const next = [...prev];
        for (const it of items) {
          const idx = next.findIndex((r) => r.bundleId === it.bundleId);
          const row: Row = {
            bundleId: it.bundleId,
            bundle: bundlesById.get(it.bundleId),
            basePriceUnits: it.basePriceUnits ?? '',
            inputPerTokenUnits: it.inputPerTokenUnits ?? '',
            outputPerTokenUnits: it.outputPerTokenUnits ?? '',
            perSecondUnits: it.perSecondUnits ?? '',
            perImageUnits: it.perImageUnits ?? '',
            providerCostUnits: it.providerCostUnits ?? '',
            marginBps: it.marginBps != null ? String(it.marginBps) : '',
            dirty: false,
            isNew: false,
          };
          if (idx === -1) next.push(row);
          else next[idx] = row;
        }
        return next;
      });
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full max-w-md items-center gap-2">
          <BundlePicker
            bundles={bundles}
            excludeIds={rows.map((r) => r.bundleId)}
            value={pickerValue}
            onChange={(id) => addBundle(id)}
            placeholder={t('addBundlePlaceholder')}
          />
        </div>
        <PriceImportDialog onImport={handleImport} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
          {t('noPrices')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableBundle')}</TableHead>
                <TableHead>{t('tableUnit')}</TableHead>
                <TableHead>{t('tableBase')}</TableHead>
                <TableHead>{t('tableInput')}</TableHead>
                <TableHead>{t('tableOutput')}</TableHead>
                <TableHead>{t('tablePerSecond')}</TableHead>
                <TableHead>{t('tablePerImage')}</TableHead>
                <TableHead>{t('tableProviderCost')}</TableHead>
                <TableHead>{t('tableMargin')}</TableHead>
                <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={r.bundleId} className={r.dirty || r.isNew ? 'bg-amber-500/5' : ''}>
                  <TableCell className="max-w-[220px] truncate text-xs">
                    {describe(r.bundle, r.bundleId)}
                  </TableCell>
                  <TableCell className="text-xs">{r.bundle?.unit ?? '—'}</TableCell>
                  {(
                    [
                      'basePriceUnits',
                      'inputPerTokenUnits',
                      'outputPerTokenUnits',
                      'perSecondUnits',
                      'perImageUnits',
                      'providerCostUnits',
                      'marginBps',
                    ] as const
                  ).map((field) => (
                    <TableCell key={field}>
                      <Input
                        className="h-8 w-28 font-mono text-xs"
                        value={r[field]}
                        onChange={(e) => update(idx, { [field]: e.target.value } as Partial<Row>)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending || (!r.dirty && !r.isNew)}
                        onClick={() => saveRow(idx)}
                      >
                        {tCommon('save')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => deleteRow(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dirtyCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
            <span className="text-sm text-muted-foreground">
              {t('pendingEdits', { count: dirtyCount })}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={pending} onClick={discard}>
                {t('discard')}
              </Button>
              <Button disabled={pending} onClick={saveAll}>
                {t('saveAll')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
