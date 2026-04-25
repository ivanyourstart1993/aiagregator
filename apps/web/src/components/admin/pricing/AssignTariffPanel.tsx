'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  assignTariffAction,
  unassignTariffAction,
} from '@/app/[locale]/(admin)/admin/pricing/actions';
import type { TariffSummary } from '@/lib/server-api';

interface Props {
  userId: string;
  tariffs: TariffSummary[];
  currentTariff: TariffSummary | null;
}

export function AssignTariffPanel({ userId, tariffs, currentTariff }: Props) {
  const t = useTranslations('admin.pricing.user');
  const tTariffs = useTranslations('admin.pricing.tariffs');
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(currentTariff?.id ?? '');
  const [reason, setReason] = useState('');

  const options: ComboboxOption[] = tariffs.map((tariff) => ({
    value: tariff.id,
    label: tariff.name,
    hint: `${tariff.slug}${tariff.isDefault ? ' • ' + tTariffs('isDefault') : ''}`,
  }));

  function assign() {
    if (!selected) return;
    startTransition(async () => {
      const res = await assignTariffAction(userId, selected, reason.trim() || undefined);
      if (!res.ok) toast.error(t('assignFailed'));
      else toast.success(t('assigned'));
    });
  }

  function reset() {
    startTransition(async () => {
      const res = await unassignTariffAction(userId);
      if (!res.ok) toast.error(t('unassignFailed'));
      else toast.success(t('unassigned'));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('tariffPanelTitle')}</CardTitle>
        <CardDescription>{t('tariffPanelSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <span className="text-muted-foreground">{t('currentTariff')}: </span>
          <span className="font-medium">
            {currentTariff
              ? `${currentTariff.name}${currentTariff.isDefault ? ` (${tTariffs('isDefault')})` : ''}`
              : '—'}
          </span>
        </div>
        <div className="space-y-2">
          <Label>{t('selectTariff')}</Label>
          <Combobox
            options={options}
            value={selected}
            onChange={setSelected}
            placeholder={t('selectTariff')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-reason">{t('assignReason')}</Label>
          <Input
            id="assign-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button disabled={pending || !selected} onClick={assign}>
            {t('assign')}
          </Button>
          <Button variant="outline" disabled={pending} onClick={reset}>
            {t('resetToDefault')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
