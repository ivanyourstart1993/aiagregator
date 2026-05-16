import { ApiError, serverApi, type AdminErrorLogFilters } from '@/lib/server-api';
import { SearchInput } from '@/components/data-table/SearchInput';
import { Pagination } from '@/components/data-table/Pagination';
import { Link } from '@/i18n/navigation';

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

function statusBadge(code: number): string {
  if (code >= 500)
    return 'rounded bg-destructive/15 px-2 py-0.5 text-destructive';
  if (code >= 400)
    return 'rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-500';
  return 'rounded bg-muted px-2 py-0.5';
}

export default async function ErrorLogsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filters: AdminErrorLogFilters = {
    page,
    pageSize: PAGE_SIZE,
    userEmail: sp.q || undefined,
    errorCode: sp.errorCode || undefined,
  };

  let total = 0;
  let items: Awaited<ReturnType<typeof serverApi.adminListErrorLogs>>['items'] = [];
  try {
    const r = await serverApi.adminListErrorLogs(filters);
    total = r.total ?? 0;
    items = r.items ?? [];
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ошибки API</h1>
        <p className="text-sm text-muted-foreground">
          5xx-ошибки, пойманные PublicErrorFilter. Кликни строку чтобы увидеть stack.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Поиск по email юзера…" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/30 uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Время</th>
                <th className="px-4 py-3 text-left">HTTP</th>
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-left">Юзер</th>
                <th className="px-4 py-3 text-left">Код</th>
                <th className="px-4 py-3 text-left">Сообщение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-3 font-mono">
                    <Link
                      href={`/error-logs/${e.id}`}
                      className="hover:underline"
                    >
                      {new Date(e.createdAt).toLocaleString()}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusBadge(e.statusCode)}>
                      {e.statusCode} {e.httpMethod}
                    </span>
                  </td>
                  <td
                    className="max-w-[280px] truncate px-4 py-3 font-mono"
                    title={e.url}
                  >
                    {e.url}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3">
                    {e.user?.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-destructive">
                    {e.errorCode ?? '—'}
                  </td>
                  <td
                    className="max-w-[280px] truncate px-4 py-3 text-muted-foreground"
                    title={e.errorMessage ?? ''}
                  >
                    {e.errorMessage ?? '—'}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Ошибок не найдено
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
