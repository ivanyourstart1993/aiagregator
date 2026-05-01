import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ExportStatus, ExportView } from '@/lib/server-api';

export function ExportsTable({ items }: { items: ExportView[] }) {
  const t = useTranslations('exports');
  const tType = useTranslations('exports.type');
  const tStatus = useTranslations('exports.status');
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
            <TableHead>{t('tableType')}</TableHead>
            <TableHead>{t('tableFormat')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableCreated')}</TableHead>
            <TableHead>{t('tableExpires')}</TableHead>
            <TableHead>{t('tableRows')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-sm">{tType(e.type)}</TableCell>
              <TableCell className="text-xs uppercase">{e.format}</TableCell>
              <TableCell>
                <StatusBadge status={e.status} label={tStatus(e.status)} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {e.expiresAt ? new Date(e.expiresAt).toLocaleString() : '—'}
              </TableCell>
              <TableCell className="text-xs">{e.rowsCount ?? '—'}</TableCell>
              <TableCell className="text-right">
                {e.status === 'DONE' && e.fileUrl ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={e.fileUrl} target="_blank" rel="noreferrer">
                      {t('download')}
                    </a>
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status, label }: { status: ExportStatus; label: string }) {
  switch (status) {
    case 'DONE':
      return <Badge variant="default">{label}</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">{label}</Badge>;
    case 'PROCESSING':
    case 'PENDING':
      return <Badge variant="secondary">{label}</Badge>;
    case 'EXPIRED':
      return <Badge variant="outline">{label}</Badge>;
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}
