'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Edit, Trash2 } from 'lucide-react';
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
import { Link } from '@/i18n/navigation';
import type { ProxyView } from '@/lib/server-api';
import { deleteProxyAction } from '@/app/[locale]/(admin)/admin/providers/actions';

interface Props {
  items: ProxyView[];
}

export function ProxiesTable({ items }: Props) {
  const t = useTranslations('admin.providers.proxies');
  const tCommon = useTranslations('common');
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
        {t('noItems')}
      </div>
    );
  }

  function handleDelete(id: string) {
    if (!confirm(tCommon('confirm'))) return;
    startTransition(async () => {
      const res = await deleteProxyAction(id);
      if (res.ok) toast.success(t('deleted'));
      else toast.error(t('deleteFailed'));
    });
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableName')}</TableHead>
            <TableHead>{t('tableHost')}</TableHead>
            <TableHead>{t('tableProtocol')}</TableHead>
            <TableHead>{t('tableCountry')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableLatency')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="font-mono text-xs">
                {p.host}:{p.port}
              </TableCell>
              <TableCell className="text-xs">{p.protocol}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.country ?? '—'}
                {p.region ? ` / ${p.region}` : ''}
              </TableCell>
              <TableCell>
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell className="text-xs">
                {p.latencyMs != null ? `${p.latencyMs} ms` : '—'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/providers/proxies/${p.id}`}>
                      <Edit className="h-4 w-4" />
                      {tCommon('edit')}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => handleDelete(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
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

function StatusBadge({ status }: { status: ProxyView['status'] }) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="default">{status}</Badge>;
    case 'DISABLED':
      return <Badge variant="secondary">{status}</Badge>;
    case 'BROKEN':
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
