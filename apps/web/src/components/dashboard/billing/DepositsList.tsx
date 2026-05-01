import { ExternalLink, Eye } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNanoToUSD } from '@/lib/money';
import type { DepositView } from '@/lib/server-api';
import { DepositStatusBadge } from './DepositStatusBadge';

interface Props {
  deposits: DepositView[];
}

export function DepositsList({ deposits }: Props) {
  const t = useTranslations('topup');
  const format = useFormatter();

  if (deposits.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        {t('noInvoices')}
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">{t('tableAmount')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableCreated')}</TableHead>
            <TableHead>{t('tableExpires')}</TableHead>
            <TableHead>{t('tablePaidAt')}</TableHead>
            <TableHead className="w-32 text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deposits.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="text-right font-mono">${formatNanoToUSD(d.amountUnits)}</TableCell>
              <TableCell>
                <DepositStatusBadge status={d.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {format.dateTime(new Date(d.createdAt), 'short')}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {d.expiresAt ? format.dateTime(new Date(d.expiresAt), 'short') : '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {d.paidAt ? format.dateTime(new Date(d.paidAt), 'short') : '—'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {d.status === 'PENDING_PAYMENT' && d.payUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={d.payUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('payNow')}
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/top-up/${d.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
