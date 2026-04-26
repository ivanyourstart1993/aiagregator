'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  pauseBundleAction,
  pauseGenerationAction,
  pauseProviderAction,
} from '@/app/[locale]/(admin)/admin/settings/actions';

interface Props {
  generationPaused: boolean;
}

export function PauseToggles({ generationPaused }: Props) {
  const t = useTranslations('admin.settings.pauseToggles');
  const [paused, setPaused] = useState(generationPaused);
  const [providerCode, setProviderCode] = useState('');
  const [bundleKey, setBundleKey] = useState('');
  const [pending, startTransition] = useTransition();

  function toggleGeneration(next: boolean) {
    setPaused(next);
    startTransition(async () => {
      const res = await pauseGenerationAction(next);
      if (res.ok) toast.success(t('applied'));
      else {
        setPaused(!next);
        toast.error(t('failed'));
      }
    });
  }

  function pauseProvider(next: boolean) {
    if (!providerCode.trim()) return;
    startTransition(async () => {
      const res = await pauseProviderAction(providerCode.trim(), next);
      if (res.ok) toast.success(t('applied'));
      else toast.error(t('failed'));
    });
  }

  function pauseBundle(next: boolean) {
    if (!bundleKey.trim()) return;
    startTransition(async () => {
      const res = await pauseBundleAction(bundleKey.trim(), next);
      if (res.ok) toast.success(t('applied'));
      else toast.error(t('failed'));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={paused} onCheckedChange={toggleGeneration} disabled={pending} />
          <Label>{t('generation')}</Label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px] space-y-1">
            <Label>{t('providerCode')}</Label>
            <Input value={providerCode} onChange={(e) => setProviderCode(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => pauseProvider(true)}>
            {t('pauseProvider')}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => pauseProvider(false)}>
            {t('resumeProvider')}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px] space-y-1">
            <Label>{t('bundleKey')}</Label>
            <Input value={bundleKey} onChange={(e) => setBundleKey(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => pauseBundle(true)}>
            {t('pauseBundle')}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => pauseBundle(false)}>
            {t('resumeBundle')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
