import { ApiError, serverApi } from '@/lib/server-api';

interface Task {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  user: { email: string };
  method: {
    code: string;
    provider: { code: string };
    model: { code: string };
  } | null;
}

async function load(): Promise<Task[]> {
  try {
    const r = await serverApi.adminListTasks({ pageSize: 50 });
    return (r.items ?? []) as unknown as Task[];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

function dur(s: string | null, f: string | null): string {
  if (!s || !f) return '—';
  const ms = +new Date(f) - +new Date(s);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function TasksPage() {
  const items = await load();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Задачи</h1>
        <p className="text-sm text-muted-foreground">Последние 50</p>
      </header>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
                  <span
                    className={
                      t.status === 'SUCCEEDED'
                        ? 'rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-500'
                        : t.status === 'FAILED'
                          ? 'rounded bg-destructive/15 px-2 py-0.5 text-destructive'
                          : t.status === 'PROCESSING'
                            ? 'rounded bg-blue-500/15 px-2 py-0.5 text-blue-500'
                            : 'rounded bg-muted px-2 py-0.5'
                    }
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">{dur(t.startedAt, t.finishedAt)}</td>
                <td className="max-w-[180px] truncate px-4 py-3">{t.user.email}</td>
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
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Задач нет
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
