import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { ProxyForm } from '@/components/admin/ProxyForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProxyPage({ params }: Props) {
  const { id } = await params;
  let proxy;
  try {
    proxy = await serverApi.adminGetProxy(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not_found') return notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/providers/proxies"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Назад
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{proxy.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {proxy.protocol} {proxy.host}:{proxy.port}
        </p>
      </header>
      <div className="rounded-lg border border-border bg-card p-6">
        <ProxyForm mode="edit" proxy={proxy} />
      </div>
    </div>
  );
}
