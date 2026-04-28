'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Edit, Power, PowerOff, Trash2 } from 'lucide-react';
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
import type { ProviderAccountView } from '@/lib/server-api';
import {
  deleteProviderAccountAction,
  toggleProviderAccountAction,
} from '@/app/[locale]/(admin)/admin/providers/actions';

interface Props {
  items: ProviderAccountView[];
}

export function AccountsTable({ items }: Props) {
  const t = useTranslations('admin.providers.accounts');
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
      const res = await deleteProviderAccountAction(id);
      if (res.ok) toast.success(t('deleted'));
      else toast.error(t('deleteFailed'));
    });
  }

  function handleToggle(id: string, enable: boolean) {
    startTransition(async () => {
      const res = await toggleProviderAccountAction(id, enable);
      if (res.ok) toast.success(enable ? t('enabled') : t('disabled'));
      else toast.error(t('toggleFailed'));
    });
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tableProvider')}</TableHead>
            <TableHead>{t('tableName')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableProxy')}</TableHead>
            <TableHead>{t('tableTodayLimit')}</TableHead>
            <TableHead>{t('tableLastError')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-xs">{a.providerCode ?? a.providerId}</TableCell>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge status={a.status} />
                  {BILLING_STATUSES.has(a.status) ? (
                    <Badge variant="destructive" className="text-[10px]">
                      ⚠ Проблема с биллингом
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {a.proxy ? a.proxy.name : '—'}
              </TableCell>
              <TableCell className="text-xs">
                {(a.todayUsed ?? 0)} / {a.dailyLimit ?? '∞'}
              </TableCell>
              <TableCell className="text-xs">
                <LastErrorCell
                  code={a.lastErrorCode ?? null}
                  message={a.lastErrorMessage ?? null}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/providers/accounts/${a.id}`}>
                      <Edit className="h-4 w-4" />
                      {tCommon('edit')}
                    </Link>
                  </Button>
                  {a.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleToggle(a.id, false)}
                    >
                      <PowerOff className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleToggle(a.id, true)}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => handleDelete(a.id)}
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

// Statuses indicating the upstream provider account is broken at the source
// (billing not enabled, quota burned, credentials invalid). Operator must fix
// it in the provider's console — retrying our side won't help.
const BILLING_STATUSES = new Set<ProviderAccountView['status']>([
  'EXCLUDED_BY_BILLING' as ProviderAccountView['status'],
  'QUOTA_EXHAUSTED' as ProviderAccountView['status'],
  'INVALID_CREDENTIALS' as ProviderAccountView['status'],
]);

function LastErrorCell({
  code,
  message,
}: {
  code: string | null;
  message: string | null;
}) {
  if (!code && !message) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-1" title={message ?? code ?? ''}>
      <span className="font-mono text-muted-foreground truncate max-w-[280px]">
        {code ?? message}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderAccountView['status'] }) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="default">{status}</Badge>;
    case 'DISABLED':
      return <Badge variant="secondary">{status}</Badge>;
    case 'BROKEN':
      return <Badge variant="destructive">{status}</Badge>;
    case 'EXHAUSTED':
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
