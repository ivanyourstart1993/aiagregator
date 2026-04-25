import { ArrowLeft, Tags } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { TariffForm } from '@/components/admin/pricing/TariffForm';

interface Props {
  params: Promise<{ tariffId: string }>;
}

export default async function TariffEditPage({ params }: Props) {
  const { tariffId } = await params;
  const t = await getTranslations('admin.pricing.tariffs');
  const tCommon = await getTranslations('common');

  let tariff;
  try {
    tariff = await serverApi.adminGetTariff(tariffId);
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/pricing/tariffs">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <CardTitle>{t('editTitle')}</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/pricing/tariffs/${tariffId}/prices`}>
              <Tags className="h-4 w-4" />
              {t('managePrices')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <TariffForm mode="edit" tariff={tariff} />
        </CardContent>
      </Card>
    </div>
  );
}
