import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ModelForm } from '@/components/admin/catalog/ModelForm';

interface Params { providerId: string }

export default async function NewModelPage({ params }: { params: Params }) {
  const t = await getTranslations('admin.catalog');
  const tCommon = await getTranslations('common');
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/catalog/providers/${params.providerId}`}>
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newModel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelForm mode="create" providerId={params.providerId} />
        </CardContent>
      </Card>
    </div>
  );
}
