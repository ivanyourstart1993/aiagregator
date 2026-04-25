import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { MethodForm } from '@/components/admin/catalog/MethodForm';

interface Params { modelId: string }

export default async function NewMethodPage({ params }: { params: Params }) {
  const t = await getTranslations('admin.catalog');
  const tCommon = await getTranslations('common');
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/catalog/models/${params.modelId}`}>
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newMethod')}</CardTitle>
        </CardHeader>
        <CardContent>
          <MethodForm mode="create" modelId={params.modelId} />
        </CardContent>
      </Card>
    </div>
  );
}
