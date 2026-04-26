import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type ProviderAdminView, type ProxyView } from '@/lib/server-api';
import { AccountForm } from '@/components/admin/providers/AccountForm';

async function safeProviders(): Promise<ProviderAdminView[]> {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeProxies(): Promise<ProxyView[]> {
  try {
    const data = await serverApi.adminListProxies();
    return Array.isArray(data) ? data : data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function NewProviderAccountPage() {
  const t = await getTranslations('admin.providers.accounts');
  const tCommon = await getTranslations('common');
  const [providers, proxies] = await Promise.all([safeProviders(), safeProxies()]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/providers/accounts">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm mode="create" providers={providers} proxies={proxies} />
        </CardContent>
      </Card>
    </div>
  );
}
