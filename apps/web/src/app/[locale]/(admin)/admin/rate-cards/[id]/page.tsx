import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type ProviderAdminView,
  type RateCardView,
} from '@/lib/server-api';
import { RateCardForm } from '@/components/admin/rate-cards/RateCardForm';

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

export default async function RateCardDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations('admin.rateCards');
  const tCommon = await getTranslations('common');

  const [card, providers]: [RateCardView | null, ProviderAdminView[] | null] = await Promise.all([
    safe(() => serverApi.adminGetRateCard(id)),
    safe(() => serverApi.adminListProviders()),
  ]);
  if (!card) notFound();

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
          <CardTitle>{t('editTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RateCardForm mode="edit" card={card} providers={providers ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
