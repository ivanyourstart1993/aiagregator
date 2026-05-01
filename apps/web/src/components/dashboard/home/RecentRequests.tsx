import { ArrowRight, Inbox } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ApiRequestView } from '@/lib/server-api';
import { formatNanoUSDWithSign } from '@/lib/money';
import { ApiRequestStatusBadge } from '@/components/dashboard/requests/ApiRequestStatusBadge';

interface Props {
  items: ApiRequestView[];
}

export async function RecentRequests(props: Props) {
  try {
    return await renderRecentRequests(props);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs">
        <div className="font-semibold text-destructive">RecentRequests error</div>
        <pre className="overflow-auto whitespace-pre-wrap">{`${e.name}: ${e.message}\n${e.stack ?? ''}`}</pre>
      </div>
    );
  }
}

async function renderRecentRequests({ items }: Props) {
  const t = await getTranslations('dashboard.recentRequests');
  const format = await getFormatter();

  return (
    <section className="rounded-lg border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/requests"
          className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('viewAll')}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/30"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ApiRequestStatusBadge status={r.status} />
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {r.providerCode}/{r.modelCode}/{r.methodCode}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-mono text-xs text-foreground/80">
                    {formatNanoUSDWithSign(r.clientPriceUnits)}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {format.relativeTime(new Date(r.createdAt), new Date())}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
