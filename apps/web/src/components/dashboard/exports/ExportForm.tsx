'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExportFormat, ExportType } from '@/lib/server-api';
import { createExportAction } from '@/app/[locale]/(dashboard)/exports/actions';

const TYPES: ExportType[] = ['TRANSACTIONS', 'REQUESTS', 'TASKS', 'DEPOSITS'];
const FORMATS: ExportFormat[] = ['csv', 'json'];

export function ExportForm() {
  const t = useTranslations('exports');
  const tType = useTranslations('exports.type');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<ExportType>('TRANSACTIONS');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const filter: { from?: string; to?: string } = {};
    if (from) filter.from = from;
    if (to) filter.to = to;
    startTransition(async () => {
      const res = await createExportAction({ type, format, filter });
      if (res.ok) {
        toast.success(t('created'));
        router.push('/exports');
      } else {
        toast.error(t('createFailed'));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t('fieldType')}</Label>
        <Select value={type} onValueChange={(v) => setType(v as ExportType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((tp) => (
              <SelectItem key={tp} value={tp}>
                {tType(tp)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t('fieldFormat')}</Label>
        <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {f.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('fieldFrom')}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('fieldTo')}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('loading') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
