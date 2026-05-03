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
  try {
    return await renderPlayground();
  } catch (err) {
    // TEMP DIAGNOSTIC — render the actual error so we can see what's
    // crashing playground in prod. Mirror the pattern used on
    // /dashboard/page.tsx. Remove once debugged.
    const e = err instanceof Error ? err : new Error(String(err));
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold text-destructive">Playground render error</h1>
        <pre className="overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-4 text-xs">
{`${e.name}: ${e.message}\n\n${e.stack ?? '(no stack)'}`}
        </pre>
      </div>
    );
  }
}

async function renderPlayground() {
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
