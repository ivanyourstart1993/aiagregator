import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type ApiRequestsPage } from '@/lib/server-api';
import { ApiRequestsTable } from '@/components/dashboard/requests/ApiRequestsTable';

const EMPTY_PAGE: ApiRequestsPage = { items: [], total: 0, page: 1, pageSize: 20 };

async function safeApiRequests(): Promise<ApiRequestsPage> {
  try {
    return await serverApi.listApiRequests({ page: 1, pageSize: 20 });
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_PAGE;
    return EMPTY_PAGE;
  }
}

export default async function RequestsPage() {
  const t = await getTranslations('requests');
  const data = await safeApiRequests();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ApiRequestsTable initialPage={data} />
    </div>
  );
}
