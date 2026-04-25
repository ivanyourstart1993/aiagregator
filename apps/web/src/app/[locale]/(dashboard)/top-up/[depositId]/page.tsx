import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type DepositView } from '@/lib/server-api';
import { DepositStatusPanel } from '@/components/dashboard/billing/DepositStatusPanel';

interface Props {
  params: Promise<{ depositId: string }>;
}

async function safeGetDeposit(id: string): Promise<DepositView | null> {
  try {
    return await serverApi.getDeposit(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function DepositStatusPage({ params }: Props) {
  const { depositId } = await params;
  const tCommon = await getTranslations('common');
  const deposit = await safeGetDeposit(depositId);
  if (!deposit) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/top-up">
            <ArrowLeft className="h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
      </header>

      <div className="max-w-2xl">
        <DepositStatusPanel initialDeposit={deposit} />
      </div>
    </div>
  );
}
