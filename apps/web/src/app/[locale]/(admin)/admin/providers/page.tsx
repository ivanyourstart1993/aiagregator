import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type ProviderAccountView,
  type ProviderAdminView,
} from '@/lib/server-api';

async function safeProviders(): Promise<ProviderAdminView[]> {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeAccounts(): Promise<ProviderAccountView[]> {
  try {
    const data = await serverApi.adminListProviderAccounts({ pageSize: 500 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminProvidersPage() {
  const t = await getTranslations('admin.providers');
  const [providers, accounts] = await Promise.all([safeProviders(), safeAccounts()]);

  if (providers.length === 0) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </header>
        <div className="rounded-lg border border-dashed bg-background py-12 text-center text-sm text-muted-foreground">
          {t('noProviders')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => {
          const accs = accounts.filter((a) => a.providerId === p.id);
          const active = accs.filter((a) => a.status === 'ACTIVE').length;
          const failures = accs.filter((a) => !!a.lastErrorCode).length;
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {p.publicName}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{p.code}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('totalAccounts')}</span>
                  <span className="font-medium">{accs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('activeAccounts')}</span>
                  <span className="font-medium">{active}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('recentFailures')}</span>
                  <span className="font-medium">{failures}</span>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={`/admin/providers/accounts?providerId=${p.id}`}>
                    {t('viewAccounts')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
