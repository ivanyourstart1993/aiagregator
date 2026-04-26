import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DlqJob } from '@/lib/server-api';
import { DlqActions } from './DlqActions';

interface Props {
  queue: 'generation' | 'callback';
  items: DlqJob[];
}

export function DlqTable({ queue, items }: Props) {
  const t = useTranslations('admin.dlq');
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noItems')}
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableJobId')}</TableHead>
            <TableHead>{t('tableFailedAt')}</TableHead>
            <TableHead>{t('tableReason')}</TableHead>
            <TableHead>{t('tableAttempts')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="font-mono text-xs">{j.jobId}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(j.failedAt).toLocaleString()}
              </TableCell>
              <TableCell className="max-w-md truncate text-xs">{j.reason ?? '—'}</TableCell>
              <TableCell className="text-xs">{j.attempts ?? '—'}</TableCell>
              <TableCell className="text-right">
                <DlqActions queue={queue} jobId={j.jobId} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
