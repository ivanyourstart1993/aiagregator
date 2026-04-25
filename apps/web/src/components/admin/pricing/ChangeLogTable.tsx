'use client';

import { useFormatter, useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TariffChangeLogEntry } from '@/lib/server-api';

interface Props {
  changes: TariffChangeLogEntry[];
}

export function ChangeLogTable({ changes }: Props) {
  const t = useTranslations('admin.pricing.changes');
  const format = useFormatter();

  if (changes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noChanges')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableAction')}</TableHead>
            <TableHead>{t('tableTarget')}</TableHead>
            <TableHead>{t('tableActor')}</TableHead>
            <TableHead>{t('tableWhen')}</TableHead>
            <TableHead>{t('before')} / {t('after')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.action}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {c.tariffId ? `tariff:${c.tariffId.slice(0, 8)} ` : ''}
                {c.userId ? `user:${c.userId.slice(0, 8)} ` : ''}
                {c.bundleId ? `bundle:${c.bundleId.slice(0, 8)}` : ''}
              </TableCell>
              <TableCell className="text-xs">{c.changedById ?? '—'}</TableCell>
              <TableCell className="text-xs">
                {format.dateTime(new Date(c.createdAt), 'short')}
              </TableCell>
              <TableCell>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t('before')} / {t('after')}
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium">{t('before')}</p>
                      <pre className="overflow-auto rounded bg-muted p-2 text-[10px]">
                        {JSON.stringify(c.before ?? null, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium">{t('after')}</p>
                      <pre className="overflow-auto rounded bg-muted p-2 text-[10px]">
                        {JSON.stringify(c.after ?? null, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
