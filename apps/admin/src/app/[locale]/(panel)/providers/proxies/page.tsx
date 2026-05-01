import Link from 'next/link';
import { ApiError, serverApi, type ProxyView } from '@/lib/server-api';

async function load(): Promise<ProxyView[]> {
  try {
    const r = await serverApi.adminListProxies();
    if (Array.isArray(r)) return r;
    return (r as { items?: ProxyView[] }).items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function ProxiesPage() {
  const items = await load();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Прокси</h1>
          <p className="text-sm text-muted-foreground">Всего: {items.length}</p>
        </div>
        <Link
          href="/providers/proxies/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Добавить прокси
        </Link>
      </header>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Имя</th>
              <th className="px-4 py-3 text-left">Host:Port</th>
              <th className="px-4 py-3 text-left">Протокол</th>
              <th className="px-4 py-3 text-left">Страна</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/providers/proxies/${p.id}`}
                    className="hover:underline"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {p.host}:{p.port}
                </td>
                <td className="px-4 py-3 text-xs">{p.protocol}</td>
                <td className="px-4 py-3 text-xs">{p.country ?? '—'}</td>
                <td className="px-4 py-3 text-xs">
                  <span
                    className={
                      p.status === 'ACTIVE'
                        ? 'rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-500'
                        : 'rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-500'
                    }
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/providers/proxies/${p.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Редактировать →
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Прокси нет.{' '}
                  <Link
                    href="/providers/proxies/new"
                    className="text-primary hover:underline"
                  >
                    Добавь первый →
                  </Link>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
