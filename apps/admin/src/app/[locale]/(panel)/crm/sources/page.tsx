import { ApiError, serverApi, type LeadSourceView } from '@/lib/server-api';
import { SourceForm } from '@/components/crm/SourceForm';
import { SourceRowActions } from '@/components/crm/SourceRowActions';

const KIND_LABELS: Record<string, string> = {
  ITUNES_SEARCH: 'iTunes',
  PLAY_STORE_SEARCH: 'Play Store',
  LYZEM_SEARCH: 'Lyzem',
  TGSTAT_SEARCH: 'TGStat',
  TELEGRAM_MENTIONS: 'TG mentions',
  FACEBOOK_AD_LIBRARY: 'FB Ads',
  MANUAL: 'Manual',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export default async function CrmSourcesPage() {
  let items: LeadSourceView[] = [];
  try {
    const r = await serverApi.adminListLeadSources();
    items = r.items;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Источники discovery
        </h1>
        <p className="text-sm text-muted-foreground">
          Откуда брать новых лидов. Каждый запуск приносит новые карточки в
          колонку <span className="font-mono">NEW</span>.
        </p>
      </header>

      <section className="rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Название</th>
                <th className="px-4 py-2 text-left">Тип</th>
                <th className="px-4 py-2 text-left">Интервал</th>
                <th className="px-4 py-2 text-left">Last run</th>
                <th className="px-4 py-2 text-left">Статус</th>
                <th className="px-4 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Источников ещё нет — добавьте ниже.
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {!s.enabled ? '⏸ выключен' : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {KIND_LABELS[s.kind] ?? s.kind}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {s.intervalMinutes ? `${s.intervalMinutes} мин` : 'manual'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {fmt(s.lastRunAt)}
                      {s.lastRunFound != null ? (
                        <span className="ml-1 text-emerald-600">
                          (+{s.lastRunFound})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {s.lastRunStatus === 'failed' ? (
                        <span className="text-rose-500" title={s.lastRunError ?? ''}>
                          failed
                        </span>
                      ) : s.lastRunStatus === 'success' ? (
                        <span className="text-emerald-600">success</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <SourceRowActions id={s.id} enabled={s.enabled} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Добавить источник</h2>
        <SourceForm />
      </section>
    </div>
  );
}
