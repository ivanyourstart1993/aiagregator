import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, serverApi, type ProxyView } from '@/lib/server-api';
import { AccountForm } from '@/components/admin/AccountForm';

interface Props {
  params: Promise<{ id: string }>;
}

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

export default async function EditAccountPage({ params }: Props) {
  const { id } = await params;
  let account;
  try {
    account = await serverApi.adminGetProviderAccount(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not_found') return notFound();
    throw err;
  }
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
        <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {account.providerCode ?? account.providerId} · статус: {account.status}
        </p>
      </header>
      <div className="rounded-lg border border-border bg-card p-6">
        <AccountForm
          mode="edit"
          account={account}
          providers={providers}
          proxies={proxies}
        />
      </div>
    </div>
  );
}
