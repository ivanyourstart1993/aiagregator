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
import { Link } from '@/i18n/navigation';
import { type ApiRequestsPage } from '@/lib/server-api';
import { formatNanoUSDWithSign } from '@/lib/money';
import { ApiRequestStatusBadge } from './ApiRequestStatusBadge';
import { TaskStatusBadge } from './TaskStatusBadge';
import { fetchApiRequestsAction } from '@/app/[locale]/(dashboard)/requests/actions';

const PAGE_SIZE = 20;

interface Props {
  initialPage: ApiRequestsPage;
}

export function ApiRequestsTable({ initialPage }: Props) {
  const t = useTranslations('requests');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [data, setData] = useState<ApiRequestsPage>(initialPage);
  const [pending, startTransition] = useTransition();

  function refetch(page: number) {
    startTransition(async () => {
      const res = await fetchApiRequestsAction({ page, pageSize: PAGE_SIZE });
      if (!res.ok || !res.data) {
        toast.error(t('loadFailed'));
        return;
      }
      setData(res.data);
    });
  }

  const totalPages = Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize)));
  const canPrev = data.page > 1;
  const canNext = data.page < totalPages;

  return (
    <div className="space-y-4">
      {data.items.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableCreated')}</TableHead>
                <TableHead>{t('tableMethod')}</TableHead>
                <TableHead>{t('tableStatus')}</TableHead>
                <TableHead className="text-right">{t('tablePrice')}</TableHead>
                <TableHead>{t('tableTaskStatus')}</TableHead>
                <TableHead className="w-12 text-right">{t('tableActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(r.createdAt), 'short')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.providerCode}/{r.modelCode}/{r.methodCode}
                  </TableCell>
                  <TableCell>
                    <ApiRequestStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNanoUSDWithSign(r.clientPriceUnits)}
                  </TableCell>
                  <TableCell>
                    {r.taskStatus ? <TaskStatusBadge status={r.taskStatus} /> : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm" title={tCommon('view')}>
                      <Link href={`/requests/${r.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
    </div>
  );
}
