import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type ProviderAdminView } from '@/lib/server-api';
import { RateCardForm } from '@/components/admin/rate-cards/RateCardForm';

async function safeProviders(): Promise<ProviderAdminView[]> {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function NewRateCardPage() {
  const t = await getTranslations('admin.rateCards');
  const tCommon = await getTranslations('common');
  const providers = await safeProviders();
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/rate-cards">
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t('newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RateCardForm mode="create" providers={providers} />
        </CardContent>
      </Card>
    </div>
  );
}
