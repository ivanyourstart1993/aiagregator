'use client';

import { CalendarRange, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TransactionType } from '@/lib/server-api';

const ALL_TYPES: TransactionType[] = [
  'DEPOSIT',
  'DEBIT',
  'REFUND',
  'CORRECTION',
  'BONUS_GRANT',
  'BONUS_CORRECTION',
  'COUPON_DISCOUNT',
  'RESERVATION_HOLD',
  'RESERVATION_RELEASE',
  'RESERVATION_CAPTURE',
];

export interface FiltersState {
  type: TransactionType | 'ALL';
  from: string;
  to: string;
  userId?: string;
}

export const EMPTY_FILTERS: FiltersState = { type: 'ALL', from: '', to: '' };

interface Props {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  onApply: () => void;
  showUserId?: boolean;
}

export function TransactionFilters({ value, onChange, onApply, showUserId }: Props) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tType = useTranslations('billing.type');
  const [open, setOpen] = useState(false);

  const dateRangeLabel = useMemo(() => {
    if (!value.from && !value.to) return tCommon('all');
    if (value.from && value.to) return `${value.from} → ${value.to}`;
    if (value.from) return `${tCommon('from')} ${value.from}`;
    if (value.to) return `${tCommon('to')} ${value.to}`;
    return tCommon('all');
  }, [value.from, value.to, tCommon]);

  function reset() {
    onChange(showUserId ? { ...EMPTY_FILTERS, userId: '' } : EMPTY_FILTERS);
    onApply();
  }

  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('filterType')}
        </Label>
        <Select
          value={value.type}
          onValueChange={(v) => onChange({ ...value, type: v as TransactionType | 'ALL' })}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t('filterTypeAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('filterTypeAll')}</SelectItem>
            {ALL_TYPES.map((tp) => (
              <SelectItem key={tp} value={tp}>
                {tType(tp)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('filterFrom')} / {t('filterTo')}
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" type="button" className="w-full justify-start font-normal sm:min-w-[14rem]">
              <CalendarRange className="h-4 w-4" />
              {dateRangeLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="filter-from" className="text-xs">
                  {t('filterFrom')}
                </Label>
                <Input
                  id="filter-from"
                  type="date"
                  value={value.from}
                  onChange={(e) => onChange({ ...value, from: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filter-to" className="text-xs">
                  {t('filterTo')}
                </Label>
                <Input
                  id="filter-to"
                  type="date"
                  value={value.to}
                  onChange={(e) => onChange({ ...value, to: e.target.value })}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {showUserId ? (
        <div className="space-y-1">
          <Label htmlFor="filter-user" className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('tableUser')}
          </Label>
          <Input
            id="filter-user"
            value={value.userId ?? ''}
            onChange={(e) => onChange({ ...value, userId: e.target.value })}
            placeholder="user_..."
            className="w-56"
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" onClick={onApply}>
          {tCommon('apply')}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          <X className="h-4 w-4" />
          {tCommon('reset')}
        </Button>
      </div>
    </div>
  );
}
