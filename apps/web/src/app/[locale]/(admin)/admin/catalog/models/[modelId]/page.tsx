import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type MethodAdminView } from '@/lib/server-api';
import { ModelForm } from '@/components/admin/catalog/ModelForm';

interface Params { modelId: string }

async function safeListMethods(modelId: string): Promise<MethodAdminView[]> {
  try {
    return await serverApi.adminListMethods(modelId);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function EditModelPage({ params }: { params: Params }) {
  const t = await getTranslations('admin.catalog');
  const tCommon = await getTranslations('common');

  let model;
  try {
    model = await serverApi.adminGetModel(params.modelId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    notFound();
  }
  if (!model) notFound();
  const methods = await safeListMethods(model.id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/catalog/providers/${model.providerId}`}>
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{model.publicName}</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelForm mode="edit" model={model} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('methods')}</CardTitle>
          <Button asChild size="sm">
            <Link href={`/admin/catalog/models/${model.id}/methods/new`}>
              {t('newMethod')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noMethods')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {methods.map((mt) => (
                <Link
                  key={mt.id}
                  href={`/admin/catalog/methods/${mt.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <div>
                    <div className="font-medium">{mt.publicName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{mt.code}</div>
                  </div>
                  <Badge variant={mt.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {mt.status}
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
