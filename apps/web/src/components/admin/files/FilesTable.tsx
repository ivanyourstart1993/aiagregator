import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FileView, ResultFileStatus } from '@/lib/server-api';
import { FileDeleteButton } from './FileDeleteButton';

function bytes(n?: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesTable({ items }: { items: FileView[] }) {
  const t = useTranslations('admin.files');
  const tStatus = useTranslations('admin.files.status');
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
            <TableHead>{t('tableId')}</TableHead>
            <TableHead>{t('tableUser')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableSize')}</TableHead>
            <TableHead>{t('tableExpires')}</TableHead>
            <TableHead>{t('tableCreated')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono text-[11px]">{f.id}</TableCell>
              <TableCell className="text-xs">{f.userEmail ?? f.userId}</TableCell>
              <TableCell>
                <StatusBadge status={f.status} label={tStatus(f.status)} />
              </TableCell>
              <TableCell className="text-xs">{bytes(f.sizeBytes)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {f.expiresAt ? new Date(f.expiresAt).toLocaleString() : '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(f.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <FileDeleteButton id={f.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status, label }: { status: ResultFileStatus; label: string }) {
  switch (status) {
    case 'STORED':
      return <Badge variant="default">{label}</Badge>;
    case 'PENDING':
      return <Badge variant="secondary">{label}</Badge>;
    case 'EXPIRED':
      return <Badge variant="outline">{label}</Badge>;
    case 'DELETED':
      return <Badge variant="outline">{label}</Badge>;
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}
