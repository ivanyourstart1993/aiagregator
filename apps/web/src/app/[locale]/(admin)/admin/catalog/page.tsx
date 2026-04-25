import { getTranslations } from 'next-intl/server';
import {
  ApiError,
  serverApi,
  type MethodAdminView,
  type ModelAdminView,
  type ProviderAdminView,
} from '@/lib/server-api';
import { CatalogTree } from '@/components/admin/catalog/CatalogTree';

interface SearchParams {
  providerId?: string;
  modelId?: string;
}

async function safeListProviders(): Promise<ProviderAdminView[]> {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeListModels(providerId: string): Promise<ModelAdminView[]> {
  try {
    return await serverApi.adminListModels(providerId);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeListMethods(modelId: string): Promise<MethodAdminView[]> {
  try {
    return await serverApi.adminListMethods(modelId);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('admin.catalog');
  const providers = await safeListProviders();
  const providerId = searchParams.providerId;
  const modelId = searchParams.modelId;
  const models = providerId ? await safeListModels(providerId) : [];
  const methods = modelId ? await safeListMethods(modelId) : [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <CatalogTree
        providers={providers}
        models={models}
        methods={methods}
        selectedProviderId={providerId}
        selectedModelId={modelId}
      />
    </div>
  );
}
