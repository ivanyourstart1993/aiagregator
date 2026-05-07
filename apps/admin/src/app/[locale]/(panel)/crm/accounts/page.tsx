import {
  ApiError,
  serverApi,
  type OutreachAccountView,
  type ProxyView,
} from '@/lib/server-api';
import { OutreachAccountForm } from '@/components/crm/OutreachAccountForm';
import { OutreachAccountRowActions } from '@/components/crm/OutreachAccountRowActions';

const STATUS_BADGE: Record<string, string> = {
  WARMING: 'bg-amber-500/15 text-amber-600',
  ACTIVE: 'bg-emerald-500/15 text-emerald-600',
  PAUSED: 'bg-zinc-500/15 text-zinc-500',
  BLOCKED: 'bg-rose-500/15 text-rose-500',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function asProxyArray(r: ProxyView[] | { items: ProxyView[] }): ProxyView[] {
  return Array.isArray(r) ? r : r.items ?? [];
}

export default async function CrmOutreachAccountsPage() {
  let items: OutreachAccountView[] = [];
  try {
    const r = await serverApi.adminListOutreachAccounts();
    items = r.items;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  let proxies: { id: string; name: string; country: string | null }[] = [];
  try {
    const r = await serverApi.adminListProxies();
    proxies = asProxyArray(r).map((p) => ({
      id: p.id,
      name: p.name,
      country: p.country ?? null,
    }));
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Telegram аккаунты для outreach
        </h1>
        <p className="text-sm text-muted-foreground">
          Пул прогретых юзерботов. Каждый аккаунт сидит на своём прокси,
          отправляет не больше дневного лимита.
        </p>
      </header>

      <section className="rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Аккаунт</th>
                <th className="px-4 py-2 text-left">Прокси</th>
                <th className="px-4 py-2 text-left">Сегодня</th>
                <th className="px-4 py-2 text-left">Всего</th>
                <th className="px-4 py-2 text-left">Прогрев с</th>
                <th className="px-4 py-2 text-left">Статус</th>
                <th className="px-4 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Аккаунтов нет — добавьте ниже.
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{a.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {a.phone}
                      </div>
                      {!a.hasSession ? (
                        <div className="text-xs text-amber-600">
                          ⚠ нужно залогиниться
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {a.proxy ? (
                        <>
                          <div className="font-medium">{a.proxy.name}</div>
                          <div className="text-muted-foreground">
                            {a.proxy.country ?? ''}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {a.todaySent} / {a.dailyLimit}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {a.totalSent}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {fmt(a.warmupStartedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span
                        className={`rounded px-1.5 py-0.5 ${STATUS_BADGE[a.status] ?? 'bg-muted'}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <OutreachAccountRowActions id={a.id} status={a.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Добавить аккаунт</h2>
        <OutreachAccountForm proxies={proxies} />
      </section>
    </div>
  );
}
