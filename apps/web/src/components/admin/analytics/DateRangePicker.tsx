'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function DateRangePicker() {
  const t = useTranslations('admin.analytics');
  const router = useRouter();
  const sp = useSearchParams();
  const [from, setFrom] = useState(sp.get('from') ?? '');
  const [to, setTo] = useState(sp.get('to') ?? '');

  function apply() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?');
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {from || to ? `${from || '…'} → ${to || '…'}` : t('apply')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('from')}
          </label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('to')}
          </label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button type="button" size="sm" onClick={apply} className="w-full">
          {t('apply')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
