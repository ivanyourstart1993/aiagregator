import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { TariffForm } from '@/components/admin/pricing/TariffForm';

export default async function NewTariffPage() {
  const t = await getTranslations('admin.pricing.tariffs');
  const tCommon = await getTranslations('common');

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/pricing/tariffs">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TariffForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
