import { notFound } from 'next/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { MethodPage } from '@/components/docs/MethodPage';

interface Params {
  provider: string;
  model: string;
  method: string;
}

export default async function MethodDocsPage({ params }: { params: Params }) {
  let method;
  try {
    method = await serverApi.catalogGetMethod(params.provider, params.model, params.method);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    // eslint-disable-next-line no-console
    console.error('[docs/method] failed to fetch method', {
      provider: params.provider,
      model: params.model,
      method: params.method,
      err: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    notFound();
  }
  if (!method) notFound();

  // Try to enrich with provider/model display names
  let providerName: string | undefined;
  let modelName: string | undefined;
  try {
    const providers = await serverApi.catalogListProviders();
    const p = providers.find((x) => x.code === method!.providerCode);
    providerName = p?.publicName;
    modelName = p?.models?.find((m) => m.code === method!.modelCode)?.publicName;
  } catch {
    // ignore
  }

  return <MethodPage method={method} providerName={providerName} modelName={modelName} />;
}
