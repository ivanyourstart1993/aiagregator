import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ProviderForm } from '@/components/admin/catalog/ProviderForm';

export default async function NewProviderPage() {
  const t = await getTranslations('admin.catalog');
  const tCommon = await getTranslations('common');
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
          <CardTitle>{t('newProvider')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
