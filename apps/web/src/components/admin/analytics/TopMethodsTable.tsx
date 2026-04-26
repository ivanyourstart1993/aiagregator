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
import type { TopMethodRow } from '@/lib/server-api';

export function TopMethodsTable({ rows }: { rows: TopMethodRow[] }) {
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
            <TableHead>{t('tableMethod')}</TableHead>
            <TableHead>{t('tableRevenue')}</TableHead>
            <TableHead>{t('tableRequests')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.providerCode}-${r.modelCode}-${r.methodCode}`}>
              <TableCell className="font-mono text-xs">
                {r.providerCode ?? '?'}/{r.modelCode ?? '?'}/{r.methodCode}
              </TableCell>
              <TableCell className="font-mono text-xs">{formatNanoToUSD(r.revenueUnits)}</TableCell>
              <TableCell className="text-sm">{r.requestsCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
