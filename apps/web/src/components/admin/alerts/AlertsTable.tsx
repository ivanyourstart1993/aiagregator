'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
import type { AlertSeverity, AlertView } from '@/lib/server-api';
import {
  acknowledgeAlertAction,
  resolveAlertAction,
} from '@/app/[locale]/(admin)/admin/alerts/actions';

interface Props {
  items: AlertView[];
}

export function AlertsTable({ items }: Props) {
  const t = useTranslations('admin.alerts');
  const tSev = useTranslations('admin.alerts.severity');
  const tCat = useTranslations('admin.alerts.category');
  const tStatus = useTranslations('admin.alerts.status');
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function ack(id: string) {
    startTransition(async () => {
      const res = await acknowledgeAlertAction(id);
      if (res.ok) toast.success(t('acknowledged'));
      else toast.error(t('actionFailed'));
    });
  }

  function resolve(id: string) {
    startTransition(async () => {
      const res = await resolveAlertAction(id);
      if (res.ok) toast.success(t('resolved'));
      else toast.error(t('actionFailed'));
    });
  }

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
            <TableHead className="w-8" />
            <TableHead>{t('tableSeverity')}</TableHead>
            <TableHead>{t('tableCategory')}</TableHead>
            <TableHead>{t('tableStatus')}</TableHead>
            <TableHead>{t('tableTitle')}</TableHead>
            <TableHead>{t('tableCreated')}</TableHead>
            <TableHead className="w-[1%] text-right">{t('tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a) => {
            const isOpen = expanded.has(a.id);
            return (
              <>
                <TableRow key={a.id}>
                  <TableCell>
                    <button type="button" onClick={() => toggle(a.id)}>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={a.severity} label={tSev(a.severity)} />
                  </TableCell>
                  <TableCell className="text-xs">{tCat(a.category)}</TableCell>
                  <TableCell className="text-xs">{tStatus(a.status)}</TableCell>
                  <TableCell className="text-sm font-medium">{a.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {a.status === 'OPEN' ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => ack(a.id)}>
                          {t('acknowledge')}
                        </Button>
                      ) : null}
                      {a.status !== 'RESOLVED' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => resolve(a.id)}
                        >
                          {t('resolve')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
                {isOpen ? (
                  <TableRow key={a.id + '-d'}>
                    <TableCell colSpan={7} className="bg-muted/30">
                      <div className="space-y-2 p-2 text-xs">
                        {a.message ? <div>{a.message}</div> : null}
                        {a.context ? (
                          <pre className="overflow-auto rounded bg-background p-2 font-mono text-[11px]">
                            {JSON.stringify(a.context, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SeverityBadge({ severity, label }: { severity: AlertSeverity; label: string }) {
  switch (severity) {
    case 'CRITICAL':
      return <Badge variant="destructive">{label}</Badge>;
    case 'WARNING':
      return <Badge variant="default">{label}</Badge>;
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}
