'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BundlePicker } from './BundlePicker';
import { upsertUserBundlePriceAction } from '@/app/[locale]/(admin)/admin/pricing/actions';
import type { BundleView } from '@/lib/server-api';

interface Props {
  userId: string;
  bundles: BundleView[];
  excludeIds?: string[];
  onSaved?: () => void;
}

const FIELDS = [
  'basePriceUnits',
  'inputPerTokenUnits',
  'outputPerTokenUnits',
  'perSecondUnits',
  'perImageUnits',
  'providerCostUnits',
] as const;

type FieldKey = (typeof FIELDS)[number];

export function UserBundlePriceForm({ userId, bundles, excludeIds, onSaved }: Props) {
  const t = useTranslations('admin.pricing.user');
  const tPrices = useTranslations('admin.pricing.prices');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();
  const [bundleId, setBundleId] = useState('');
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<Record<FieldKey, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<FieldKey, string>,
  );
  const [marginBps, setMarginBps] = useState('');

  function submit() {
    if (!bundleId) return;
    const num = (s: string): string | null => (s.trim() === '' ? null : s.trim());
    const intOrNull = (s: string): number | null => {
      const t = s.trim();
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    startTransition(async () => {
      const res = await upsertUserBundlePriceAction(userId, bundleId, {
        basePriceUnits: num(values.basePriceUnits),
        inputPerTokenUnits: num(values.inputPerTokenUnits),
        outputPerTokenUnits: num(values.outputPerTokenUnits),
        perSecondUnits: num(values.perSecondUnits),
        perImageUnits: num(values.perImageUnits),
        providerCostUnits: num(values.providerCostUnits),
        marginBps: intOrNull(marginBps),
        reason: reason.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(t('saveFailed'));
        return;
      }
      toast.success(t('saved'));
      setBundleId('');
      setReason('');
      setValues(Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<FieldKey, string>);
      setMarginBps('');
      onSaved?.();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <Label>{t('addOverride')}</Label>
      <BundlePicker
        bundles={bundles}
        excludeIds={excludeIds}
        value={bundleId}
        onChange={setBundleId}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f} className="space-y-1">
            <Label className="text-xs">{f}</Label>
            <Input
              className="h-8 font-mono text-xs"
              value={values[f]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f]: e.target.value }))}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-xs">marginBps</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={marginBps}
            onChange={(e) => setMarginBps(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{tPrices('amountHint')}</p>
      <div className="space-y-1">
        <Label className="text-xs">reason</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button disabled={pending || !bundleId} onClick={submit}>
          {tCommon('save')}
        </Button>
      </div>
    </div>
  );
}
