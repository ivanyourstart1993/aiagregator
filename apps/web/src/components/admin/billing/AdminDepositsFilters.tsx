'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
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
import { DepositsTable } from './DepositsTable';
import {
  type DepositStatus,
  type DepositView,
  type DepositsPage,
} from '@/lib/server-api';
import { adminFetchDepositsAction } from '@/app/[locale]/(admin)/admin/billing/deposits/actions';

const ALL_STATUSES: DepositStatus[] = [
  'CREATED',
  'PENDING_PAYMENT',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
];

interface Props {
  initialDeposits: DepositView[];
}

export function AdminDepositsFilters({ initialDeposits }: Props) {
  const t = useTranslations('admin.billing');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('topup.status');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<DepositStatus | 'ALL'>('ALL');
  const [list, setList] = useState<DepositView[]>(initialDeposits);
  const [pending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      const filters: Parameters<typeof adminFetchDepositsAction>[0] = { page: 1, pageSize: 50 };
      if (userId) filters.userId = userId;
      if (status !== 'ALL') filters.status = status;
      const res = await adminFetchDepositsAction(filters);
      if (!res.ok || !res.data) {
        toast.error(tCommon('error'));
        return;
      }
      const items = (res.data as DepositsPage).items ?? [];
      setList(items);
    });
  }

  function reset() {
    setUserId('');
    setStatus('ALL');
    setList(initialDeposits);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="userId" className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('filterUserId')}
          </Label>
          <Input
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={t('filterUserIdPlaceholder')}
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('filterStatus')}
          </Label>
          <Select value={status} onValueChange={(v) => setStatus(v as DepositStatus | 'ALL')}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('filterAllStatuses')}</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {tStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="button" disabled={pending} onClick={apply}>
            {tCommon('apply')}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            <X className="h-4 w-4" />
            {tCommon('reset')}
          </Button>
        </div>
      </div>

      <DepositsTable deposits={list} />
    </div>
  );
}
