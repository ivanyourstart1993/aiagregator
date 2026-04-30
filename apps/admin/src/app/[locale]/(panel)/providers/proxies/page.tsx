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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Прокси</h1>
        <p className="text-sm text-muted-foreground">Всего: {items.length}</p>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{p.name}</td>
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
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Прокси нет
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
