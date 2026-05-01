import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type ExportView } from '@/lib/server-api';
import { ExportsTable } from '@/components/dashboard/exports/ExportsTable';

async function safeList(): Promise<ExportView[]> {
  try {
    const data = await serverApi.listExports();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function ExportsPage() {
  const t = await getTranslations('exports');
  const items = await safeList();
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/exports/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>
      <ExportsTable items={items} />
    </div>
  );
}
