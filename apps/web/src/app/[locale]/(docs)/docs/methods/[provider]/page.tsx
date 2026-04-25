import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, serverApi, type MethodView, type ProviderView } from '@/lib/server-api';

interface Params { provider: string }

async function loadProvider(code: string): Promise<{ provider: ProviderView; methods: MethodView[] } | null> {
  try {
    const [providers, methods] = await Promise.all([
      serverApi.catalogListProviders(),
      serverApi.catalogListMethods({ provider: code }).catch(() => [] as MethodView[]),
    ]);
    const provider = providers.find((p) => p.code === code);
    if (!provider) return null;
    return { provider, methods };
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function ProviderPage({ params }: { params: Params }) {
  const t = await getTranslations('docs');
  const data = await loadProvider(params.provider);
  if (!data) notFound();
  const { provider, methods } = data;
  const models = provider.models ?? [];

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{provider.publicName}</h1>
        {provider.description ? (
          <p className="text-muted-foreground">{provider.description}</p>
        ) : null}
      </header>
      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noModels')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {models.map((m) => {
            const count = methods.filter((mt) => mt.modelCode === m.code).length;
            const firstMethod = methods.find((mt) => mt.modelCode === m.code);
            const href = firstMethod
              ? `/docs/methods/${provider.code}/${m.code}/${firstMethod.code}`
              : `/docs/methods/${provider.code}`;
            return (
              <Link key={m.id} href={href} className="block">
                <Card className="transition-colors hover:border-primary">
                  <CardHeader>
                    <CardTitle>{m.publicName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {m.description ? (
                      <p className="text-muted-foreground">{m.description}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {t('countMethods', { count })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
