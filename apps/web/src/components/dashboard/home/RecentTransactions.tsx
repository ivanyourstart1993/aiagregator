import { ArrowDownLeft, ArrowRight, ArrowUpRight, Receipt } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { TransactionView } from '@/lib/server-api';
import { formatNanoUSDWithSign } from '@/lib/money';
import { cn } from '@/lib/utils';

interface Props {
  items: TransactionView[];
}

const POSITIVE_TYPES = new Set([
  'DEPOSIT',
  'BONUS_GRANT',
  'REFUND',
  'CORRECTION',
  'RESERVATION_RELEASE',
]);

function isCredit(t: TransactionView): boolean {
  if (POSITIVE_TYPES.has(t.type)) return true;
  // Fallback: positive amount → credit.
  return !t.amountUnits.startsWith('-');
}

export async function RecentTransactions(props: Props) {
  try {
    return await renderRecentTransactions(props);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs">
        <div className="font-semibold text-destructive">RecentTransactions error</div>
        <pre className="overflow-auto whitespace-pre-wrap">{`${e.name}: ${e.message}\n${e.stack ?? ''}`}</pre>
      </div>
    );
  }
}

async function renderRecentTransactions({ items }: Props) {
  const t = await getTranslations('dashboard.recentTransactions');
  const tType = await getTranslations('billing.type');
  const format = await getFormatter();

  return (
    <section className="rounded-lg border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/balance"
          className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('viewAll')}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Receipt className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((tr) => {
            const credit = isCredit(tr);
            const Icon = credit ? ArrowDownLeft : ArrowUpRight;
            return (
              <li key={tr.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      credit ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">
                      {tType(tr.type)}
                    </div>
                    {tr.description ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {tr.description}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      'font-mono text-sm font-medium tabular-nums',
                      credit ? 'text-success' : 'text-foreground/80',
                    )}
                  >
                    {credit && !tr.amountUnits.startsWith('-') ? '+' : ''}
                    {formatNanoUSDWithSign(tr.amountUnits)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format.relativeTime(new Date(tr.createdAt), new Date())}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
