import { useTranslations, useFormatter } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiKeyView } from '@/lib/server-api';
import { RevokeKeyButton } from './RevokeKeyButton';
import { RotateWebhookButton } from './RotateWebhookButton';

interface ApiKeysTableProps {
  keys: ApiKeyView[];
}

export function ApiKeysTable({ keys }: ApiKeysTableProps) {
  const t = useTranslations('apiKeys');
  const format = useFormatter();

  if (keys.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        {t('empty')}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('tableName')}</TableHead>
          <TableHead>{t('tableKey')}</TableHead>
          <TableHead>{t('tableStatus')}</TableHead>
          <TableHead>{t('tableLastUsed')}</TableHead>
          <TableHead>{t('tableCreated')}</TableHead>
          <TableHead className="w-12 text-right">{t('tableActions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium">{key.name}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              sk_live_{key.prefix}_••••••••{key.last4}
            </TableCell>
            <TableCell>
              <StatusBadge status={key.status} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {key.lastUsedAt ? format.dateTime(new Date(key.lastUsedAt), 'short') : t('neverUsed')}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format.dateTime(new Date(key.createdAt), 'short')}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <RotateWebhookButton id={key.id} disabled={key.status !== 'ACTIVE'} />
                <RevokeKeyButton id={key.id} disabled={key.status !== 'ACTIVE'} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: ApiKeyView['status'] }) {
  const t = useTranslations('apiKeys');
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="default">{t('statusActive')}</Badge>;
    case 'DISABLED':
      return <Badge variant="secondary">{t('statusDisabled')}</Badge>;
    case 'REVOKED':
      return <Badge variant="outline">{t('statusRevoked')}</Badge>;
    default:
      return null;
  }
}
