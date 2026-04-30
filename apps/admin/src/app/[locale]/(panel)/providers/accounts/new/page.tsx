import Link from 'next/link';
import { ApiError, serverApi, type ProxyView } from '@/lib/server-api';
import { AccountForm } from '@/components/admin/AccountForm';

async function loadProxies(): Promise<ProxyView[]> {
  try {
    const r = await serverApi.adminListProxies();
    return Array.isArray(r) ? r : (r.items ?? []);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function loadProviders() {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function NewAccountPage() {
  const [providers, proxies] = await Promise.all([loadProviders(), loadProxies()]);

  return (
    <div className="space-y-6">
      <Link
        href="/providers/accounts"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Назад
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Новый аккаунт провайдера</h1>
        <p className="text-sm text-muted-foreground">
          Привяжи API-ключ или Service Account к провайдеру и (рекомендуется!) прокси.
        </p>
      </header>
      <div className="rounded-lg border border-border bg-card p-6">
        {providers.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Сначала создай провайдер в каталоге.
          </div>
        ) : (
          <AccountForm mode="create" providers={providers} proxies={proxies} />
        )}
      </div>
    </div>
  );
}
