import { getTranslations } from 'next-intl/server';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ApiError, serverApi, type DlqJob } from '@/lib/server-api';
import { DlqTable } from '@/components/admin/dlq/DlqTable';

async function safeList(queue: 'generation' | 'callback'): Promise<DlqJob[]> {
  try {
    const data = await serverApi.adminListDlq(queue, { pageSize: 100 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminDlqPage() {
  const t = await getTranslations('admin.dlq');
  const [generation, callback] = await Promise.all([safeList('generation'), safeList('callback')]);
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <Tabs defaultValue="generation">
        <TabsList>
          <TabsTrigger value="generation">{t('tabGeneration')}</TabsTrigger>
          <TabsTrigger value="callback">{t('tabCallback')}</TabsTrigger>
        </TabsList>
        <TabsContent value="generation" className="mt-4">
          <DlqTable queue="generation" items={generation} />
        </TabsContent>
        <TabsContent value="callback" className="mt-4">
          <DlqTable queue="callback" items={callback} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
