import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNanoToUSD } from '@/lib/money';
import type { TopUserRow } from '@/lib/server-api';

export function TopUsersTable({ rows }: { rows: TopUserRow[] }) {
  const t = useTranslations('admin.analytics');
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-8 text-center text-sm text-muted-foreground">
        {t('noData')}
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableUser')}</TableHead>
            <TableHead>{t('tableRevenue')}</TableHead>
            <TableHead>{t('tableRequests')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell className="text-sm">{r.email ?? r.userId}</TableCell>
              <TableCell className="font-mono text-xs">{formatNanoToUSD(r.revenueUnits)}</TableCell>
              <TableCell className="text-sm">{r.requestsCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
