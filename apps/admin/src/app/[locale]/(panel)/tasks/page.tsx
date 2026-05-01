import { ApiError, serverApi, type AdminTaskFilters } from '@/lib/server-api';
import { SearchInput } from '@/components/data-table/SearchInput';
import { Pagination } from '@/components/data-table/Pagination';
import { FilterSelect } from '@/components/data-table/FilterSelect';

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: 'QUEUED', label: 'QUEUED' },
  { value: 'PROCESSING', label: 'PROCESSING' },
  { value: 'SUCCEEDED', label: 'SUCCEEDED' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'CANCELLED', label: 'CANCELLED' },
];

function dur(s: string | null, f: string | null): string {
  if (!s || !f) return '—';
  const ms = +new Date(f) - +new Date(s);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusClass(s: string): string {
  if (s === 'SUCCEEDED')
    return 'rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-500';
  if (s === 'FAILED')
    return 'rounded bg-destructive/15 px-2 py-0.5 text-destructive';
  if (s === 'PROCESSING')
    return 'rounded bg-blue-500/15 px-2 py-0.5 text-blue-500';
  if (s === 'QUEUED')
    return 'rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-500';
  return 'rounded bg-muted px-2 py-0.5';
}

export default async function TasksPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filters: AdminTaskFilters = {
    page,
    pageSize: PAGE_SIZE,
    status:
      (sp.status as AdminTaskFilters['status']) === undefined
        ? undefined
        : (sp.status as AdminTaskFilters['status']),
    userEmail: sp.q || undefined,
    errorCode: sp.errorCode || undefined,
  };

  let total = 0;
  let items: Awaited<ReturnType<typeof serverApi.adminListTasks>>['items'] = [];
  try {
    const r = await serverApi.adminListTasks(filters);
    total = r.total ?? 0;
    items = r.items ?? [];
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Задачи</h1>
        <p className="text-sm text-muted-foreground">
          История генераций по всем юзерам
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Поиск по email юзера…" />
        <FilterSelect
          paramKey="status"
          options={STATUS_OPTIONS}
          placeholder="Все статусы"
          allLabel="Все статусы"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/30 uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Время</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3 text-left">Длит.</th>
                <th className="px-4 py-3 text-left">Юзер</th>
                <th className="px-4 py-3 text-left">Метод</th>
                <th className="px-4 py-3 text-left">Ошибка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-3 font-mono">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusClass(t.status)}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {dur(t.startedAt, t.finishedAt)}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3">
                    {t.user.email}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 font-mono">
                    {t.method
                      ? `${t.method.provider.code} / ${t.method.model.code} / ${t.method.code}`
                      : '—'}
                  </td>
                  <td
                    className="max-w-[220px] truncate px-4 py-3 font-mono text-destructive"
                    title={t.errorMessage ?? ''}
                  >
                    {t.errorCode ?? '—'}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Задач не найдено
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
        </div>
      </div>
    </div>
  );
}
