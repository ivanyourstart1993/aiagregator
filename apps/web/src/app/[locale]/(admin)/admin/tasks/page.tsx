import {
  ApiError,
  serverApi,
  type AdminTaskFilters,
  type AdminTaskStatus,
  type AdminTasksPage,
} from '@/lib/server-api';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const STATUSES: readonly AdminTaskStatus[] = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
];

function parseStatus(raw: string | undefined): AdminTaskStatus | undefined {
  if (!raw) return undefined;
  return (STATUSES as readonly string[]).includes(raw)
    ? (raw as AdminTaskStatus)
    : undefined;
}

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function durationMs(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—';
  const ms = +new Date(finishedAt) - +new Date(startedAt);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function safeList(filters: AdminTaskFilters): Promise<AdminTasksPage | null> {
  try {
    return await serverApi.adminListTasks(filters);
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

async function safeErrorSummary() {
  try {
    return await serverApi.adminTaskErrorSummary(24);
  } catch {
    return { hours: 24, since: '', items: [] as { errorCode: string; count: number }[] };
  }
}

export default async function AdminTasksPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters: AdminTaskFilters = {
    page,
    pageSize: 50,
    status: parseStatus(sp.status),
    errorCode: sp.errorCode || undefined,
    userEmail: sp.userEmail || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };

  const [data, errSummary] = await Promise.all([safeList(filters), safeErrorSummary()]);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function buildHref(p: number): string {
    const u = new URLSearchParams();
    if (filters.status) u.set('status', filters.status);
    if (filters.errorCode) u.set('errorCode', filters.errorCode);
    if (filters.userEmail) u.set('userEmail', filters.userEmail);
    if (filters.from) u.set('from', filters.from);
    if (filters.to) u.set('to', filters.to);
    u.set('page', String(p));
    return `/admin/tasks?${u.toString()}`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Задачи</h1>
        <p className="text-sm text-muted-foreground">
          История всех задач генерации. Фильтр по статусу, error_code, email пользователя, дате.
        </p>
      </header>

      {errSummary.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Ошибки за последние 24 ч
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {errSummary.items.map((e) => (
              <Link
                key={e.errorCode}
                href={`/admin/tasks?status=FAILED&errorCode=${encodeURIComponent(e.errorCode)}`}
                className="rounded-md border px-2 py-1 font-mono hover:bg-accent"
              >
                <span className="text-muted-foreground">{e.errorCode}</span>{' '}
                <span className="font-semibold">{e.count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-5" action="">
        <select
          name="status"
          defaultValue={filters.status ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Все статусы</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          name="errorCode"
          defaultValue={filters.errorCode ?? ''}
          placeholder="error_code"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="userEmail"
          defaultValue={filters.userEmail ?? ''}
          placeholder="user email contains"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="from"
          type="datetime-local"
          defaultValue={filters.from ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          name="to"
          type="datetime-local"
          defaultValue={filters.to ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="col-span-1 h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground sm:col-span-1"
        >
          Применить
        </button>
      </form>

      <div className="text-xs text-muted-foreground">Найдено: {total}</div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Длит.</th>
              <th className="px-3 py-2">Юзер</th>
              <th className="px-3 py-2">Provider / Method</th>
              <th className="px-3 py-2">Ошибка</th>
              <th className="px-3 py-2">Att</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono whitespace-nowrap">{fmt(t.createdAt)}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      t.status === 'SUCCEEDED'
                        ? 'rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700'
                        : t.status === 'FAILED'
                          ? 'rounded bg-destructive/15 px-1.5 py-0.5 text-destructive'
                          : t.status === 'PROCESSING'
                            ? 'rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-700'
                            : 'rounded bg-muted px-1.5 py-0.5'
                    }
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">
                  {durationMs(t.startedAt, t.finishedAt)}
                </td>
                <td className="px-3 py-2 truncate max-w-[180px]">{t.user.email}</td>
                <td className="px-3 py-2 truncate max-w-[280px]">
                  {t.method ? (
                    <span className="font-mono">
                      {t.method.provider.code} / {t.method.model.code} / {t.method.code}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 truncate max-w-[280px]">
                  {t.errorCode ? (
                    <span className="font-mono text-destructive" title={t.errorMessage ?? ''}>
                      {t.errorCode}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 text-center">{t.attempts}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/admin/tasks/${t.id}`} className="text-primary hover:underline">
                    →
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                  Ничего не найдено
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex justify-center gap-1 text-xs">
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="rounded border px-2 py-1 hover:bg-accent">
              ← prev
            </Link>
          ) : null}
          <span className="px-2 py-1">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={buildHref(page + 1)} className="rounded border px-2 py-1 hover:bg-accent">
              next →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
