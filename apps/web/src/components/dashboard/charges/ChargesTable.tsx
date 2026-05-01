'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type TransactionView,
  type TransactionsPage,
} from '@/lib/server-api';
import { formatNanoToUSD } from '@/lib/money';
import { TransactionTypeBadge } from '@/components/dashboard/billing/TransactionTypeBadge';
import { TransactionDetailSheet } from '@/components/dashboard/billing/TransactionDetailSheet';
import { fetchChargesAction } from '@/app/[locale]/(dashboard)/charges/actions';

const PAGE_SIZE = 20;

interface Props {
  initialPage: TransactionsPage;
}

export function ChargesTable({ initialPage }: Props) {
  const t = useTranslations('billing');
  const tCharges = useTranslations('charges');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [data, setData] = useState<TransactionsPage>(initialPage);
  const [selected, setSelected] = useState<TransactionView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function refetch(page: number) {
    startTransition(async () => {
      const res = await fetchChargesAction({ page, pageSize: PAGE_SIZE });
      if (!res.ok || !res.data) {
        toast.error(t('loadFailed'));
        return;
      }
      setData(res.data);
    });
  }

  function openDetail(tx: TransactionView) {
    setSelected(tx);
    setSheetOpen(true);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize)));
  const canPrev = data.page > 1;
  const canNext = data.page < totalPages;

  return (
    <div className="space-y-4">
      {data.items.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
          {tCharges('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableType')}</TableHead>
                <TableHead className="text-right">{t('tableAmount')}</TableHead>
                <TableHead className="text-right">{t('tableBalance')}</TableHead>
                <TableHead>{t('tableDescription')}</TableHead>
                <TableHead>{t('tableCreated')}</TableHead>
                <TableHead className="w-12 text-right">{t('tableActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tx) => {
                const positive = !tx.amountUnits.startsWith('-');
                return (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <TransactionTypeBadge type={tx.type} />
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${
                        positive ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {positive ? '+' : ''}
                      {formatNanoToUSD(tx.amountUnits)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatNanoToUSD(tx.balanceAfterUnits)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {tx.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format.dateTime(new Date(tx.createdAt), 'short')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetail(tx)}
                        title={t('viewDetails')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {tCommon('page')} {data.page} {tCommon('of')} {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canPrev || pending}
            onClick={() => refetch(data.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('previous')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canNext || pending}
            onClick={() => refetch(data.page + 1)}
          >
            {t('next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <TransactionDetailSheet open={sheetOpen} onOpenChange={setSheetOpen} tx={selected} />
    </div>
  );
}
