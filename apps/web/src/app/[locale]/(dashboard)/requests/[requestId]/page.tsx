import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { ApiRequestDetail } from '@/components/dashboard/requests/ApiRequestDetail';

interface Props {
  params: { requestId: string; locale: string };
}

export default async function RequestDetailPage({ params }: Props) {
  const t = await getTranslations('requests');
  let detail;
  try {
    detail = await serverApi.getApiRequest(params.requestId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/requests">
              <ChevronLeft className="h-4 w-4" />
              {t('backToList')}
            </Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {t('detailTitle')}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">{detail.id}</p>
        </div>
      </header>
      <ApiRequestDetail detail={detail} />
    </div>
  );
}
