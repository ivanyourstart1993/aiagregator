import Link from 'next/link';
import { ApiError, serverApi } from '@/lib/server-api';
import type {
  AnalyticsSummary,
  CostByProviderRow,
  DailyPoint,
  ProviderAccountStats,
  ProviderAccountView,
  TopUserRow,
} from '@/lib/server-api';

const NANO = 1_000_000_000;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fallback;
    return fallback;
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function bigToNum(s: string | null | undefined): number {
  if (!s) return 0;
  try {
    return Number(BigInt(s)) / NANO;
  } catch {
    return Number(s) / NANO;
  }
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function fmtPct(bps?: number | null): string {
  if (bps == null) return '—';
  return `${(bps / 100).toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

export default async function DashboardPage() {
  const from = isoDaysAgo(30);
  const to = new Date().toISOString();
  const filter = { from, to };

  const [summary, daily, costByProvider, topUsers, accountsPage] = await Promise.all([
    safe<AnalyticsSummary | null>(() => serverApi.adminAnalyticsSummary(filter), null),
    safe<DailyPoint[]>(() => serverApi.adminAnalyticsRevenueDaily(filter), []),
    safe<CostByProviderRow[]>(() => serverApi.adminAnalyticsCostByProvider(filter), []),
    safe<TopUserRow[]>(() => serverApi.adminAnalyticsTopUsers({ ...filter, limit: 10 }), []),
    safe<{ items?: ProviderAccountView[] }>(
      () => serverApi.adminListProviderAccounts({ pageSize: 200 }),
      { items: [] },
    ),
  ]);

  const accounts: ProviderAccountView[] = accountsPage.items ?? [];

  // per-account ROI — only for accounts with acquisitionCost set or recently used
  const interesting = accounts
    .filter(
      (a) =>
        (a.acquisitionCostUnits && a.acquisitionCostUnits !== '0') ||
        (a.todayUsed ?? 0) > 0 ||
        (a.monthUsed ?? 0) > 0,
    )
    .slice(0, 50);

  const accountStats: Array<{ acc: ProviderAccountView; stats: ProviderAccountStats | null }> =
    await Promise.all(
      interesting.map(async (acc) => {
        const stats = await safe<ProviderAccountStats | null>(
          () => serverApi.adminGetProviderAccountStats(acc.id, filter),
          null,
        );
        return { acc, stats };
      }),
    );

  // sort by net profit desc (profitable first)
  accountStats.sort((a, b) => {
    const pa = bigToNum(a.stats?.netProfitUnits);
    const pb = bigToNum(b.stats?.netProfitUnits);
    return pb - pa;
  });

  // Aggregate alerts
  const quotaExhausted = accounts.filter((a) => a.status === 'QUOTA_EXHAUSTED').length;
  const billingExcluded = accounts.filter((a) => a.status === 'EXCLUDED_BY_BILLING').length;
  const invalidCreds = accounts.filter((a) => a.status === 'INVALID_CREDENTIALS').length;
  const activeCount = accounts.filter((a) => a.status === 'ACTIVE').length;

  // KPI numbers
  const revenue = bigToNum(summary?.revenueUnits);
  const providerCost = bigToNum(summary?.costUnits);
  const acquisitionCostTotal = accounts.reduce(
    (s, a) => s + bigToNum(a.acquisitionCostUnits),
    0,
  );
  const netProfit = revenue - providerCost - acquisitionCostTotal;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const grossMarginBps = summary?.marginBps ?? null;

  // Sparkline
  const dailyRevenueValues = daily.map((d) => bigToNum(d.revenueUnits));
  const dailyCostValues = daily.map((d) => bigToNum(d.costUnits));
  const totalCostByProvider = costByProvider.reduce(
    (s, r) => s + bigToNum(r.costUnits),
    0,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Доходность</h1>
        <p className="text-sm text-muted-foreground">
          За последние 30 дней · с {new Date(from).toLocaleDateString('ru-RU')} по{' '}
          {new Date(to).toLocaleDateString('ru-RU')}
        </p>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Revenue"
          value={fmtUSD(revenue)}
          sub={`${summary?.requestsCount ?? 0} запросов`}
          tone="positive"
        />
        <Kpi
          label="Provider cost"
          value={fmtUSD(providerCost)}
          sub={`Gross margin ${fmtPct(grossMarginBps)}`}
        />
        <Kpi
          label="Acquisition cost"
          value={fmtUSD(acquisitionCostTotal)}
          sub={`${accounts.length} аккаунтов`}
          tone="muted"
        />
        <Kpi
          label="Net profit (30д)"
          value={fmtUSD(netProfit)}
          sub={`Net margin ${netMarginPct.toFixed(1)}%`}
          tone={netProfit >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {/* Alerts */}
      {(quotaExhausted > 0 || billingExcluded > 0 || invalidCreds > 0) && (
        <Link
          href="/providers/accounts"
          className="block rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm hover:bg-yellow-500/10"
        >
          <div className="font-semibold text-yellow-500">⚠ Проблемы с аккаунтами</div>
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {quotaExhausted > 0 && (
              <span>
                <span className="font-mono text-destructive">{quotaExhausted}</span> в
                QUOTA_EXHAUSTED
              </span>
            )}
            {billingExcluded > 0 && (
              <span>
                <span className="font-mono text-destructive">{billingExcluded}</span> в
                EXCLUDED_BY_BILLING
              </span>
            )}
            {invalidCreds > 0 && (
              <span>
                <span className="font-mono text-destructive">{invalidCreds}</span> в
                INVALID_CREDENTIALS
              </span>
            )}
            <span className="ml-auto text-muted-foreground/70">→ открыть</span>
          </div>
        </Link>
      )}

      {/* Daily revenue/cost chart */}
      {daily.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Revenue / Cost по дням</h2>
            <div className="text-xs text-muted-foreground">
              <span className="mr-3">
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                revenue
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />
                cost
              </span>
            </div>
          </div>
          <Sparkline
            revenue={dailyRevenueValues}
            cost={dailyCostValues}
            labels={daily.map((d) => d.date)}
          />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cost by provider */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Cost по провайдерам</h2>
          {costByProvider.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Нет данных</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left">Провайдер</th>
                  <th className="pb-2 text-right">Запросов</th>
                  <th className="pb-2 text-right">Cost</th>
                  <th className="pb-2 text-right">Доля</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costByProvider.slice(0, 8).map((row) => {
                  const c = bigToNum(row.costUnits);
                  const share =
                    totalCostByProvider > 0 ? (c / totalCostByProvider) * 100 : 0;
                  return (
                    <tr key={row.providerCode}>
                      <td className="py-2 font-mono text-xs">{row.providerCode}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(row.requestsCount)}</td>
                      <td className="py-2 text-right font-mono">{fmtUSD(c)}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Top users */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Топ юзеров по spend</h2>
          {topUsers.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Нет данных</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left">Email</th>
                  <th className="pb-2 text-right">Запросов</th>
                  <th className="pb-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topUsers.map((row) => (
                  <tr key={row.userId}>
                    <td className="py-2 max-w-[220px] truncate font-mono text-xs">
                      {row.email ?? row.userId}
                    </td>
                    <td className="py-2 text-right font-mono">{fmtNum(row.requestsCount)}</td>
                    <td className="py-2 text-right font-mono">
                      {fmtUSD(bigToNum(row.revenueUnits))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Per-account ROI */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">ROI по ProviderAccounts</h2>
          <div className="text-xs text-muted-foreground">
            Активных: <span className="font-mono">{activeCount}</span> / Всего:{' '}
            <span className="font-mono">{accounts.length}</span>
          </div>
        </div>
        {accountStats.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Нет аккаунтов с историей за период
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left">Аккаунт</th>
                  <th className="px-2 py-2 text-left">Провайдер</th>
                  <th className="px-2 py-2 text-left">Статус</th>
                  <th className="px-2 py-2 text-right">Запросов</th>
                  <th className="px-2 py-2 text-right">Success</th>
                  <th className="px-2 py-2 text-right">Revenue</th>
                  <th className="px-2 py-2 text-right">Cost</th>
                  <th className="px-2 py-2 text-right">Acq.</th>
                  <th className="px-2 py-2 text-right">Profit</th>
                  <th className="px-2 py-2 text-right">ROI%</th>
                  <th className="px-2 py-2 text-right">B/E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accountStats.map(({ acc, stats }) => {
                  const profit = bigToNum(stats?.netProfitUnits);
                  const revenue = bigToNum(stats?.totalRevenueUnits);
                  const provCost = bigToNum(stats?.totalProviderCostUnits);
                  const acq = bigToNum(stats?.acquisitionCostUnits);
                  const roi = stats?.roiPct;
                  const successRate =
                    stats?.attempts && stats.attempts > 0
                      ? ((stats.success ?? 0) / stats.attempts) * 100
                      : null;
                  const profitTone =
                    profit > 0
                      ? 'text-emerald-500'
                      : profit < 0
                        ? 'text-destructive'
                        : 'text-muted-foreground';
                  return (
                    <tr key={acc.id} className="hover:bg-muted/20">
                      <td className="px-2 py-2 font-medium">{acc.name}</td>
                      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                        {acc.providerCode ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <StatusPill status={acc.status} />
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {stats?.attempts ?? 0}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs">
                        {successRate != null ? `${successRate.toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{fmtUSD(revenue)}</td>
                      <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                        {fmtUSD(provCost)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                        {fmtUSD(acq)}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono ${profitTone}`}>
                        {fmtUSD(profit)}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono text-xs ${profitTone}`}>
                        {roi != null ? `${roi.toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs text-muted-foreground">
                        {stats?.breakevenAtRequest ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'muted';
}) {
  const cls =
    tone === 'positive'
      ? 'text-emerald-500'
      : tone === 'negative'
        ? 'text-destructive'
        : tone === 'muted'
          ? 'text-foreground'
          : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-500',
    QUOTA_EXHAUSTED: 'bg-yellow-500/15 text-yellow-500',
    EXCLUDED_BY_BILLING: 'bg-destructive/15 text-destructive',
    INVALID_CREDENTIALS: 'bg-destructive/15 text-destructive',
    MANUALLY_DISABLED: 'bg-muted text-muted-foreground',
  };
  const cls = map[status] ?? 'bg-muted text-muted-foreground';
  return <span className={`rounded px-2 py-0.5 ${cls}`}>{status}</span>;
}

function Sparkline({
  revenue,
  cost,
  labels,
}: {
  revenue: number[];
  cost: number[];
  labels: string[];
}) {
  if (revenue.length === 0) return null;
  const W = 800;
  const H = 140;
  const PAD = 8;
  const max = Math.max(...revenue, ...cost, 0.01);
  const xStep = (W - PAD * 2) / Math.max(revenue.length - 1, 1);
  const toPath = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = PAD + i * xStep;
        const y = H - PAD - (v / max) * (H - PAD * 2);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  const totalRev = revenue.reduce((s, v) => s + v, 0);
  const totalCost = cost.reduce((s, v) => s + v, 0);
  const lastRev = revenue[revenue.length - 1] ?? 0;
  const lastCost = cost[cost.length - 1] ?? 0;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label="revenue and cost over time"
      >
        <path
          d={toPath(cost)}
          fill="none"
          stroke="rgb(244 63 94)"
          strokeWidth="1.5"
          opacity="0.7"
        />
        <path
          d={toPath(revenue)}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="2"
        />
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
        <div>
          сумма revenue:{' '}
          <span className="font-mono text-emerald-500">{fmtUSD(totalRev)}</span> · последний:{' '}
          <span className="font-mono">{fmtUSD(lastRev)}</span>
        </div>
        <div className="text-right">
          сумма cost: <span className="font-mono text-rose-500">{fmtUSD(totalCost)}</span> ·
          последний: <span className="font-mono">{fmtUSD(lastCost)}</span>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}
