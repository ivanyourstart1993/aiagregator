import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SystemSettingView } from '@/lib/server-api';
import { SettingValueEditor } from './SettingValueEditor';

export function SettingsTable({ items }: { items: SystemSettingView[] }) {
  const t = useTranslations('admin.settings');
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
            <TableHead className="w-1/3">{t('tableKey')}</TableHead>
            <TableHead>{t('tableValue')}</TableHead>
            <TableHead className="w-40">{t('tableUpdated')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => (
            <TableRow key={s.key}>
              <TableCell className="font-mono text-xs align-top">{s.key}</TableCell>
              <TableCell className="align-top">
                <SettingValueEditor settingKey={s.key} value={s.value} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground align-top">
                {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
