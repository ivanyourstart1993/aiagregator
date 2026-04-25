import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type MethodView, type ProviderView } from '@/lib/server-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function loadData(): Promise<{ providers: ProviderView[]; methods: MethodView[] }> {
  try {
    const [providers, methods] = await Promise.all([
      serverApi.catalogListProviders(),
      serverApi.catalogListMethods().catch(() => [] as MethodView[]),
    ]);
    return { providers, methods };
  } catch (err) {
    if (err instanceof ApiError) return { providers: [], methods: [] };
    return { providers: [], methods: [] };
  }
}

export default async function MethodsIndexPage() {
  const t = await getTranslations('docs');
  const { providers, methods } = await loadData();

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('methodsIndexTitle')}</h1>
        <p className="text-muted-foreground">{t('methodsIndexBody')}</p>
      </header>
      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noProviders')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => {
            const models = p.models ?? [];
            const methodCount = methods.filter((m) => m.providerCode === p.code).length;
            return (
              <Link key={p.id} href={`/docs/methods/${p.code}`} className="block">
                <Card className="transition-colors hover:border-primary">
                  <CardHeader>
                    <CardTitle>{p.publicName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {p.description ? (
                      <p className="text-muted-foreground">{p.description}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {t('countModels', { count: models.length })} ·{' '}
                      {t('countMethods', { count: methodCount })}
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
