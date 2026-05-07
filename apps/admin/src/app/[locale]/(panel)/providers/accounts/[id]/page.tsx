import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ApiError,
  serverApi,
  type ProxyView,
  type ProviderAccountAttempt,
} from '@/lib/server-api';
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
  const [providers, proxies, attempts] = await Promise.all([
    loadProviders(),
    loadProxies(),
    loadAttempts(id),
  ]);

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
      <AttemptsLog items={attempts} />
    </div>
  );
}

async function loadAttempts(id: string): Promise<ProviderAccountAttempt[]> {
  try {
    const r = await serverApi.adminListProviderAccountAttempts(id, {
      page: 1,
      pageSize: 30,
    });
    return r.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

function statusClass(s: string): string {
  if (s === 'success')
    return 'rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-500';
  if (s === 'failed')
    return 'rounded bg-destructive/15 px-2 py-0.5 text-destructive';
  if (s === 'switched')
    return 'rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-500';
  return 'rounded bg-muted px-2 py-0.5 text-muted-foreground';
}

function dur(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function AttemptsLog({ items }: { items: ProviderAccountAttempt[] }) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-base font-semibold">
          Лог запросов{' '}
          <span className="text-xs font-normal text-muted-foreground">
            · последние {items.length}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Каждая строка — одна попытка от балансировщика. Hover на строку
          ошибки чтобы увидеть полный текст.
        </p>
      </header>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/30 uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Время</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-left">Длит.</th>
                <th className="px-3 py-2 text-left">Task</th>
                <th className="px-3 py-2 text-left">Прокси</th>
                <th className="px-3 py-2 text-left">Ошибка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    Запросов пока не было.
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {new Date(a.startedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusClass(a.status)}>{a.status}</span>
                      {a.attemptNumber > 1 ? (
                        <span className="ml-2 text-muted-foreground">
                          #{a.attemptNumber}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono">{dur(a.durationMs)}</td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2 font-mono text-muted-foreground"
                      title={a.taskId}
                    >
                      {a.taskId.slice(-12)}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2 font-mono text-muted-foreground"
                      title={
                        a.proxy
                          ? `${a.proxy.name} · ${a.proxy.host}:${a.proxy.port}${a.proxy.country ? ' · ' + a.proxy.country : ''}`
                          : '—'
                      }
                    >
                      {a.proxy ? `${a.proxy.host}` : '—'}
                    </td>
                    <td
                      className="max-w-[260px] truncate px-3 py-2 font-mono text-destructive"
                      title={a.errorMessage ?? a.errorCode ?? ''}
                    >
                      {a.errorCode ?? a.errorType ?? (a.status === 'success' ? '—' : '?')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
