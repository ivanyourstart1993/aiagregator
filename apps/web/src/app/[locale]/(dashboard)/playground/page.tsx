import { getTranslations } from 'next-intl/server';
import { ApiError, serverApi } from '@/lib/server-api';
import { PlaygroundClient } from '@/components/dashboard/playground/PlaygroundClient';

async function safeBalance() {
  try {
    return await serverApi.getBalance();
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function PlaygroundPage() {
  const t = await getTranslations('playground');
  const balance = await safeBalance();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <PlaygroundClient balance={balance} />
    </div>
  );
}

