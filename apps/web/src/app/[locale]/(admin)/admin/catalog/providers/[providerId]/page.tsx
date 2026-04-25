import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type ModelAdminView } from '@/lib/server-api';
import { ProviderForm } from '@/components/admin/catalog/ProviderForm';

interface Params { providerId: string }

async function safeListModels(providerId: string): Promise<ModelAdminView[]> {
  try {
    return await serverApi.adminListModels(providerId);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function EditProviderPage({ params }: { params: Params }) {
  const t = await getTranslations('admin.catalog');
  const tCommon = await getTranslations('common');

  let provider;
  try {
    provider = await serverApi.adminGetProvider(params.providerId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    notFound();
  }
  if (!provider) notFound();
  const models = await safeListModels(provider.id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/catalog">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{provider.publicName}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderForm mode="edit" provider={provider} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('models')}</CardTitle>
          <Button asChild size="sm">
            <Link href={`/admin/catalog/providers/${provider.id}/models/new`}>
              {t('newModel')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noModels')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {models.map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/catalog/models/${m.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <div>
                    <div className="font-medium">{m.publicName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{m.code}</div>
                  </div>
                  <Badge variant={m.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {m.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
