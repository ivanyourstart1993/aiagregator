import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { MethodForm } from '@/components/admin/catalog/MethodForm';
import { AvailabilityPanel } from '@/components/admin/catalog/AvailabilityPanel';

interface Params { methodId: string }

export default async function EditMethodPage({ params }: { params: Params }) {
  const t = await getTranslations('admin.catalog');
  const tCommon = await getTranslations('common');

  let method;
  try {
    method = await serverApi.adminGetMethod(params.methodId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    notFound();
  }
  if (!method) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/catalog/models/${method.modelId}`}>
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{method.publicName}</CardTitle>
        </CardHeader>
        <CardContent>
          <MethodForm mode="edit" method={method} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('availability')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityPanel methodId={method.id} initial={method.availability} />
        </CardContent>
      </Card>
    </div>
  );
}
