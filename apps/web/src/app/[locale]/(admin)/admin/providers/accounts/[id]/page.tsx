import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type ProviderAccountStats,
  type ProviderAccountView,
  type ProviderAdminView,
  type ProxyView,
} from '@/lib/server-api';
import { AccountForm } from '@/components/admin/providers/AccountForm';
import { AccountStatsPanel } from '@/components/admin/providers/AccountStatsPanel';

interface Props {
  params: Promise<{ id: string }>;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function ProviderAccountDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations('admin.providers.accounts');
  const tCommon = await getTranslations('common');

  const [account, providers, proxies, stats]: [
    ProviderAccountView | null,
    ProviderAdminView[] | null,
    ProxyView[] | null,
    ProviderAccountStats | null,
  ] = await Promise.all([
    safe(() => serverApi.adminGetProviderAccount(id)),
    safe(() => serverApi.adminListProviders()),
    safe(async () => {
      const data = await serverApi.adminListProxies();
      return Array.isArray(data) ? data : data.items ?? [];
    }),
    safe(() => serverApi.adminGetProviderAccountStats(id)),
  ]);

  if (!account) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/providers/accounts">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>

      <AccountStatsPanel stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>{t('editTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            mode="edit"
            account={account}
            providers={providers ?? []}
            proxies={proxies ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
