import { getTranslations } from 'next-intl/server';
import {
  ApiError,
  serverApi,
  type AnalyticsSummary,
  type PerBundleRow,
  type TopMethodRow,
  type TopUserRow,
} from '@/lib/server-api';
import { SummaryCards } from '@/components/admin/analytics/SummaryCards';
import { TopUsersTable } from '@/components/admin/analytics/TopUsersTable';
import { TopMethodsTable } from '@/components/admin/analytics/TopMethodsTable';
import { PerBundleTable } from '@/components/admin/analytics/PerBundleTable';
import { DateRangePicker } from '@/components/admin/analytics/DateRangePicker';

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fallback;
    return fallback;
  }
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: now.toISOString() };
}

function last30Range() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);
  return { from: start.toISOString(), to: now.toISOString() };
}

export default async function AdminAnalyticsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.analytics');

  const customRange = sp.from || sp.to ? { from: sp.from, to: sp.to } : null;
  const today = todayRange();
  const last30 = last30Range();
  const range = customRange ?? last30;

  const [todaySummary, rangeSummary, topUsers, topMethods, perBundle]: [
    AnalyticsSummary | null,
    AnalyticsSummary | null,
    TopUserRow[],
    TopMethodRow[],
    PerBundleRow[],
  ] = await Promise.all([
    safe(() => serverApi.adminAnalyticsSummary(today), null),
    safe(() => serverApi.adminAnalyticsSummary(range), null),
    safe(() => serverApi.adminAnalyticsTopUsers({ ...range, limit: 10 }), [] as TopUserRow[]),
    safe(() => serverApi.adminAnalyticsTopMethods({ ...range, limit: 10 }), [] as TopMethodRow[]),
    safe(() => serverApi.adminAnalyticsPerBundle(range), [] as PerBundleRow[]),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <DateRangePicker />
      </header>

      <SummaryCards label={t('today')} summary={todaySummary} />
      <SummaryCards
        label={customRange ? `${sp.from ?? ''} → ${sp.to ?? ''}` : t('last30')}
        summary={rangeSummary}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('topUsers')}</h2>
          <TopUsersTable rows={topUsers} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('topMethods')}</h2>
          <TopMethodsTable rows={topMethods} />
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('perBundle')}</h2>
        <PerBundleTable rows={perBundle} />
      </section>
    </div>
  );
}
