import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type ApiKeyView } from '@/lib/server-api';
import { ApiKeysTable } from '@/components/dashboard/api-keys/ApiKeysTable';
import { CreateKeyDialog } from '@/components/dashboard/api-keys/CreateKeyDialog';

export default async function ApiKeysPage() {
  const t = await getTranslations('apiKeys');
  const keys = await safeListKeys();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <CreateKeyDialog />
      </header>
      <ApiKeysTable keys={keys} />
    </div>
  );
}

async function safeListKeys(): Promise<ApiKeyView[]> {
  try {
    return await serverApi.listApiKeys();
  } catch (err) {
    if (err instanceof ApiError) {
      // Backend may not be reachable yet during dev — degrade gracefully.
      return [];
    }
    return [];
  }
}
