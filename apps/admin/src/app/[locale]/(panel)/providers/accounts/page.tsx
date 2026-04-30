import { ApiError, serverApi, type ProviderAccountView } from '@/lib/server-api';

async function loadAccounts(): Promise<ProviderAccountView[]> {
  try {
    const r = await serverApi.adminListProviderAccounts({ pageSize: 200 });
    return r.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

const BILLING_STATUSES = new Set([
  'EXCLUDED_BY_BILLING',
  'QUOTA_EXHAUSTED',
  'INVALID_CREDENTIALS',
]);

function statusColor(s: string): string {
  if (s === 'ACTIVE') return 'rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-500';
  if (s === 'MANUALLY_DISABLED') return 'rounded bg-muted px-2 py-0.5 text-muted-foreground';
  if (BILLING_STATUSES.has(s)) return 'rounded bg-destructive/15 px-2 py-0.5 text-destructive';
  return 'rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-500';
}

function unitsToUsd(s?: string | null): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 1_000_000_000).toFixed(2)}`;
}

export default async function ProviderAccountsPage() {
  const items = await loadAccounts();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Аккаунты провайдеров</h1>
        <p className="text-sm text-muted-foreground">Всего: {items.length}</p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Провайдер</th>
              <th className="px-4 py-3 text-left">Имя</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-left">Прокси</th>
              <th className="px-4 py-3 text-left">Стоимость</th>
              <th className="px-4 py-3 text-left">Последняя ошибка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-mono text-xs">{a.providerCode ?? a.providerId}</td>
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span className={statusColor(a.status)}>{a.status}</span>
                    {BILLING_STATUSES.has(a.status) ? (
                      <span className="text-[10px] text-destructive">⚠ Биллинг</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {a.proxy ? a.proxy.name : '—'}
                </td>
                <td className="px-4 py-3 text-xs">
                  {unitsToUsd(a.acquisitionCostUnits)}
                </td>
                <td
                  className="max-w-[300px] truncate px-4 py-3 text-xs text-muted-foreground"
                  title={a.lastErrorMessage ?? ''}
                >
                  {a.lastErrorCode ?? a.lastErrorMessage ?? '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Аккаунтов нет
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
