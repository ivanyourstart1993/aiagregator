import { ApiError, serverApi } from '@/lib/server-api';

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fallback;
    return fallback;
  }
}

export default async function DashboardPage() {
  const [dbLoad, accounts] = await Promise.all([
    safe(
      () => serverApi.adminLoadDb(),
      null as { tasks?: { total?: number; byStatus?: Record<string, number> } } | null,
    ),
    safe(
      () => serverApi.adminListProviderAccounts({ pageSize: 200 }),
      { items: [] } as { items?: Array<{ status: string }> },
    ),
  ]);

  const dbTasks = dbLoad?.tasks ?? { total: 0, byStatus: {} };
  const succeeded = dbTasks.byStatus?.SUCCEEDED ?? 0;
  const failed = dbTasks.byStatus?.FAILED ?? 0;
  const accs = accounts.items ?? [];
  const activeAccounts = accs.filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Обзор</h1>
        <p className="text-sm text-muted-foreground">
          Текущее состояние системы за всё время
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Задачи всего" value={dbTasks.total ?? 0} />
        <Stat label="Успешных" value={succeeded} positive />
        <Stat label="Неудачных" value={failed} negative={failed > 0} />
        <Stat label="Активные аккаунты" value={activeAccounts} positive />
        <Stat
          label="QUOTA_EXHAUSTED"
          value={accs.filter((a) => a.status === 'QUOTA_EXHAUSTED').length}
          negative
        />
        <Stat
          label="EXCLUDED_BY_BILLING"
          value={accs.filter((a) => a.status === 'EXCLUDED_BY_BILLING').length}
          negative
        />
        <Stat
          label="DISABLED"
          value={accs.filter((a) => a.status === 'MANUALLY_DISABLED').length}
          muted
        />
        <Stat label="Всего аккаунтов" value={accs.length} muted />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
  negative,
  muted,
}: {
  label: string;
  value: number | string;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  const cls = positive
    ? 'text-emerald-500'
    : negative
      ? 'text-destructive'
      : muted
        ? 'text-muted-foreground'
        : '';
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
