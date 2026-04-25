import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi, type MethodView, type ProviderView } from '@/lib/server-api';
import { env } from '@/lib/env';
import { ApiExplorerClient } from '@/components/dashboard/api-explorer/ApiExplorerClient';

async function loadProviders(): Promise<ProviderView[]> {
  try {
    const providers = await serverApi.catalogListProviders();
    let allMethods: MethodView[] = [];
    try {
      allMethods = await serverApi.catalogListMethods();
    } catch {
      allMethods = [];
    }
    return providers.map((p) => ({
      ...p,
      models: (p.models ?? []).map((m) => ({
        ...m,
        methods:
          m.methods ??
          allMethods.filter(
            (mt) => mt.providerCode === p.code && mt.modelCode === m.code,
          ),
      })),
    }));
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function hasActiveApiKey(): Promise<boolean> {
  try {
    const keys = await serverApi.listApiKeys();
    return keys.some((k) => k.status === 'ACTIVE');
  } catch {
    return false;
  }
}

export default async function ApiExplorerPage() {
  const t = await getTranslations('apiExplorer');
  const [providers, activeKey] = await Promise.all([loadProviders(), hasActiveApiKey()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ApiExplorerClient
        providers={providers}
        apiUrl={env.API_URL}
        hasActiveApiKey={activeKey}
      />
    </div>
  );
}
