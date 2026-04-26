import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import {
  ApiError,
  serverApi,
  type FileView,
  type ResultFileStatus,
} from '@/lib/server-api';
import { FilesTable } from '@/components/admin/files/FilesTable';

interface Props {
  searchParams: Promise<{ userId?: string; status?: string }>;
}

const STATUSES: ResultFileStatus[] = ['PENDING', 'STORED', 'EXPIRED', 'DELETED'];

async function safeList(filters: {
  userId?: string;
  status?: ResultFileStatus;
}): Promise<FileView[]> {
  try {
    const data = await serverApi.adminListFiles({ ...filters, pageSize: 100 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminFilesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.files');
  const tCommon = await getTranslations('common');
  const items = await safeList({
    userId: sp.userId?.trim() || undefined,
    status: STATUSES.includes(sp.status as ResultFileStatus)
      ? (sp.status as ResultFileStatus)
      : undefined,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-3" action="">
        <input
          name="userId"
          defaultValue={sp.userId ?? ''}
          placeholder={t('filterUserId')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <FilesTable items={items} />
    </div>
  );
}
