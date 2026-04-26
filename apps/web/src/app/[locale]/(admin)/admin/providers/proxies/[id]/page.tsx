import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type ProxyStats, type ProxyView } from '@/lib/server-api';
import { ProxyForm } from '@/components/admin/providers/ProxyForm';
import { ProxyStatsPanel } from '@/components/admin/providers/ProxyStatsPanel';

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

export default async function ProxyDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations('admin.providers.proxies');
  const tCommon = await getTranslations('common');
  const [proxy, stats]: [ProxyView | null, ProxyStats | null] = await Promise.all([
    safe(() => serverApi.adminGetProxy(id)),
    safe(() => serverApi.adminGetProxyStats(id)),
  ]);
  if (!proxy) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/providers/proxies">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>

      <ProxyStatsPanel stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>{t('editTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProxyForm mode="edit" proxy={proxy} />
        </CardContent>
      </Card>
    </div>
  );
}
