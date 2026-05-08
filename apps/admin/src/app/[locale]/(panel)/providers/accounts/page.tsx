import Link from 'next/link';
import {
  ApiError,
  serverApi,
  type ProviderAccountView,
  type ProviderAccountStatus,
} from '@/lib/server-api';
import { FilterSelect } from '@/components/data-table/FilterSelect';
import { Pagination } from '@/components/data-table/Pagination';

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'COOLDOWN', label: 'COOLDOWN' },
  { value: 'QUOTA_EXHAUSTED', label: 'QUOTA_EXHAUSTED' },
  { value: 'EXCLUDED_BY_BILLING', label: 'EXCLUDED_BY_BILLING' },
  { value: 'INVALID_CREDENTIALS', label: 'INVALID_CREDENTIALS' },
  { value: 'MANUALLY_DISABLED', label: 'MANUALLY_DISABLED' },
  { value: 'INACTIVE', label: 'INACTIVE' },
];

const BILLING_STATUSES = new Set([
  'EXCLUDED_BY_BILLING',
  'QUOTA_EXHAUSTED',
  'INVALID_CREDENTIALS',
]);

function statusColor(s: string): string {
  if (s === 'ACTIVE') return 'rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-500';
  if (s === 'COOLDOWN') return 'rounded bg-blue-500/15 px-2 py-0.5 text-blue-500';
  if (s === 'MANUALLY_DISABLED')
    return 'rounded bg-muted px-2 py-0.5 text-muted-foreground';
  if (BILLING_STATUSES.has(s))
    return 'rounded bg-destructive/15 px-2 py-0.5 text-destructive';
  return 'rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-500';
}

function unitsToUsd(s?: string | null): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 1_000_000_000).toFixed(2)}`;
}

function fmtRelative(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    // future (e.g. cooldownUntil)
    const future = -ms;
    if (future < 60_000) return `через ${Math.round(future / 1000)}с`;
    if (future < 3_600_000) return `через ${Math.round(future / 60_000)}м`;
    return `через ${Math.round(future / 3_600_000)}ч`;
  }
  if (ms < 60_000) return `${Math.round(ms / 1000)}с назад`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}м назад`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}ч назад`;
  return `${Math.round(ms / 86_400_000)}д назад`;
}

function warmupDay(warmupStartedAt?: string | null, createdAt?: string): number {
  const start = warmupStartedAt ?? createdAt;
  if (!start) return 999;
  const days = (Date.now() - new Date(start).getTime()) / (24 * 60 * 60 * 1000);
  return Math.floor(days);
}

function usagePct(used?: number | null, limit?: number | null): string {
  if (!limit || limit <= 0) return '—';
  const u = used ?? 0;
  return `${Math.round((u / limit) * 100)}%`;
}

// Pair Google banana ↔ veo accounts (matched by base name + proxyId) so
// the operator sees one row per Service Account, not two. Per-clone state
// (status, usage, errors) is rendered side-by-side inside that row.
interface RenderRow {
  banana?: ProviderAccountView;
  veo?: ProviderAccountView;
  /** Used as React key and for the "main" link target. */
  primary: ProviderAccountView;
}

function arrangePairs(items: ProviderAccountView[]): RenderRow[] {
  const banana = items.filter((a) => a.providerCode === 'google_banana');
  const veo = items.filter((a) => a.providerCode === 'google_veo');
  const others = items.filter(
    (a) =>
      a.providerCode !== 'google_banana' && a.providerCode !== 'google_veo',
  );

  const veoByKey = new Map<string, ProviderAccountView>();
  for (const v of veo) {
    const base = v.name.replace(/\s*\(google_veo\)\s*$/, '');
    veoByKey.set(`${base}|${v.proxyId ?? ''}`, v);
  }

  const usedVeoIds = new Set<string>();
  const rows: RenderRow[] = [];
  for (const b of banana) {
    const v = veoByKey.get(`${b.name}|${b.proxyId ?? ''}`);
    if (v) usedVeoIds.add(v.id);
    rows.push({ banana: b, veo: v, primary: b });
  }
  for (const v of veo) {
    if (!usedVeoIds.has(v.id)) rows.push({ veo: v, primary: v });
  }
  for (const o of others) rows.push({ primary: o });
  return rows;
}

export default async function ProviderAccountsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const status = sp.status as ProviderAccountStatus | undefined;

  let items: ProviderAccountView[] = [];
  let total = 0;
  try {
    const r = await serverApi.adminListProviderAccounts({
      page,
      pageSize: PAGE_SIZE,
      status,
    });
    items = r.items ?? [];
    total = r.total ?? items.length;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  const noProxyCount = items.filter((a) => !a.proxyId).length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Аккаунты провайдеров</h1>
          <p className="text-sm text-muted-foreground">Всего: {items.length}</p>
        </div>
        <Link
          href="/providers/accounts/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Добавить аккаунт
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          paramKey="status"
          options={STATUS_OPTIONS}
          allLabel="Все статусы"
          placeholder="Все статусы"
        />
      </div>

      {noProxyCount > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
          <div className="font-semibold text-yellow-500">
            ⚠ {noProxyCount} аккаунт{noProxyCount === 1 ? '' : 'ов'} без прокси
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Запросы летят с публичного IP Northflank — это сильный fingerprint signal.
            Привяжи прокси через редактирование аккаунта (по умолчанию балансировщик
            пропускает аккаунты без прокси).
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Имя</th>
              <th className="px-4 py-3 text-left">Провайдер</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-left">Прокси</th>
              <th className="px-4 py-3 text-right">День</th>
              <th className="px-4 py-3 text-left">Last used</th>
              <th className="px-4 py-3 text-left">Cooldown</th>
              <th className="px-4 py-3 text-left">Warmup</th>
              <th className="px-4 py-3 text-right">Стоимость</th>
              <th className="px-4 py-3 text-left">Ошибка</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {arrangePairs(items).map((row) => {
              const a = row.primary;
              const wd = warmupDay(a.warmupStartedAt, a.createdAt);
              const inWarmup = wd < 7;
              const isPair = !!row.banana && !!row.veo;
              const displayName = a.name.replace(/\s*\(google_veo\)\s*$/, '');

              // Provider label: "google · banana+veo" for pairs, raw code otherwise.
              const providerLabel = isPair
                ? 'google · banana+veo'
                : a.providerCode ?? a.providerId;

              // Per-clone helpers.
              const renderClone = (
                clone: ProviderAccountView | undefined,
                tag: 'IMG' | 'VID',
              ) => {
                if (!clone) return null;
                const inCd =
                  clone.cooldownUntil &&
                  new Date(clone.cooldownUntil).getTime() > Date.now();
                return {
                  clone,
                  tag,
                  inCd,
                };
              };
              const clones = [
                renderClone(row.banana, 'IMG'),
                renderClone(row.veo, 'VID'),
              ].filter((x): x is NonNullable<typeof x> => !!x);

              return (
                <tr key={a.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 align-top font-medium">
                    <Link
                      href={`/providers/accounts/${a.id}`}
                      className="hover:underline"
                    >
                      {displayName}
                    </Link>
                    {isPair ? (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        shared SA · фото + видео
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                    {providerLabel}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1">
                      {clones.map(({ clone, tag }) => (
                        <Link
                          key={tag}
                          href={`/providers/accounts/${clone.id}`}
                          className="flex items-center gap-2 hover:opacity-80"
                          title={`${tag} → edit`}
                        >
                          {isPair ? (
                            <span className="w-7 font-mono text-[10px] text-muted-foreground">
                              {tag}
                            </span>
                          ) : null}
                          <span className={statusColor(clone.status)}>
                            {clone.status}
                          </span>
                          {BILLING_STATUSES.has(clone.status) ? (
                            <span className="text-[10px] text-destructive">⚠</span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-xs">
                    {a.proxy ? (
                      <span
                        className="text-muted-foreground"
                        title={`${a.proxy.host}:${a.proxy.port}`}
                      >
                        {a.proxy.name}
                      </span>
                    ) : (
                      <span className="text-destructive">— нет —</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right font-mono text-xs">
                    <div className="space-y-1">
                      {clones.map(({ clone, tag }) => (
                        <div
                          key={tag}
                          className="flex items-center justify-end gap-2"
                        >
                          {isPair ? (
                            <span className="text-[10px] text-muted-foreground">
                              {tag}
                            </span>
                          ) : null}
                          <span>
                            {clone.todayUsed ?? 0}
                            {clone.dailyLimit
                              ? ` / ${clone.dailyLimit} (${usagePct(clone.todayUsed, clone.dailyLimit)})`
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                    <div className="space-y-1">
                      {clones.map(({ clone, tag }) => (
                        <div key={tag}>
                          {isPair ? (
                            <span className="mr-2 text-[10px]">{tag}</span>
                          ) : null}
                          {fmtRelative(clone.lastUsedAt)}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-xs">
                    <div className="space-y-1">
                      {clones.map(({ clone, tag, inCd }) => (
                        <div key={tag}>
                          {isPair ? (
                            <span className="mr-2 text-[10px] text-muted-foreground">
                              {tag}
                            </span>
                          ) : null}
                          {inCd ? (
                            <span className="text-blue-500">
                              {fmtRelative(clone.cooldownUntil)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-xs">
                    {inWarmup ? (
                      <span className="text-yellow-500">день {wd + 1}/7</span>
                    ) : (
                      <span className="text-muted-foreground">готов</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right text-xs">
                    {unitsToUsd(a.acquisitionCostUnits)}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 align-top text-xs text-muted-foreground">
                    <div className="space-y-1">
                      {clones.map(({ clone, tag }) => (
                        <div
                          key={tag}
                          className="truncate"
                          title={clone.lastErrorMessage ?? ''}
                        >
                          {isPair ? (
                            <span className="mr-2 text-[10px]">{tag}</span>
                          ) : null}
                          {clone.lastErrorCode ??
                            clone.lastErrorMessage ??
                            '—'}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <Link
                      href={`/providers/accounts/${a.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  Аккаунтов нет.{' '}
                  <Link
                    href="/providers/accounts/new"
                    className="text-primary hover:underline"
                  >
                    Добавь первый →
                  </Link>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="border-t border-border p-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
        </div>
      </div>
    </div>
  );
}
