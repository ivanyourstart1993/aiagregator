'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export interface ImportedPriceRow {
  bundleId: string;
  basePriceUnits?: string | null;
  inputPerTokenUnits?: string | null;
  outputPerTokenUnits?: string | null;
  perSecondUnits?: string | null;
  perImageUnits?: string | null;
  providerCostUnits?: string | null;
  marginBps?: number | null;
}

interface Props {
  onImport: (rows: ImportedPriceRow[]) => void;
}

const HEADERS = [
  'bundleId',
  'basePriceUnits',
  'inputPerTokenUnits',
  'outputPerTokenUnits',
  'perSecondUnits',
  'perImageUnits',
  'providerCostUnits',
  'marginBps',
] as const;

function parseCsv(text: string): ImportedPriceRow[] {
  const rows: ImportedPriceRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith('bundleid')) continue; // header skip
    const parts = line.split(',').map((s) => s.trim());
    const obj: Record<string, string> = {};
    HEADERS.forEach((h, i) => {
      obj[h] = parts[i] ?? '';
    });
    if (!obj.bundleId) continue;
    const num = (s: string): string | null => (s === '' ? null : s);
    const intOrNull = (s: string): number | null => {
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    rows.push({
      bundleId: obj.bundleId,
      basePriceUnits: num(obj.basePriceUnits),
      inputPerTokenUnits: num(obj.inputPerTokenUnits),
      outputPerTokenUnits: num(obj.outputPerTokenUnits),
      perSecondUnits: num(obj.perSecondUnits),
      perImageUnits: num(obj.perImageUnits),
      providerCostUnits: num(obj.providerCostUnits),
      marginBps: intOrNull(obj.marginBps),
    });
  }
  return rows;
}

export function PriceImportDialog({ onImport }: Props) {
  const t = useTranslations('admin.pricing.prices');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');

  function submit() {
    const rows = parseCsv(csv);
    if (rows.length === 0) return;
    onImport(rows);
    setOpen(false);
    setCsv('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp className="h-4 w-4" />
          {t('import')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('importTitle')}</DialogTitle>
          <DialogDescription>{t('importBody')}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          className="font-mono text-xs"
          placeholder={t('importPlaceholder')}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={submit}>{t('importSubmit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
