import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import {
  ApiError,
  serverApi,
  type AlertCategory,
  type AlertSeverity,
  type AlertStatus,
  type AlertView,
} from '@/lib/server-api';
import { AlertsTable } from '@/components/admin/alerts/AlertsTable';

interface Props {
  searchParams: Promise<{ status?: string; severity?: string; category?: string }>;
}

const STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
const SEVERITIES: AlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];
const CATEGORIES: AlertCategory[] = [
  'PROVIDER_FAILURE',
  'PROXY_FAILURE',
  'BALANCE_LOW',
  'QUEUE_OVERLOAD',
  'COST_SPIKE',
  'OTHER',
];

async function safeAlerts(filters: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  category?: AlertCategory;
}): Promise<AlertView[]> {
  try {
    const data = await serverApi.adminListAlerts({ ...filters, pageSize: 200 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminAlertsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.alerts');
  const tCommon = await getTranslations('common');

  const items = await safeAlerts({
    status: STATUSES.includes(sp.status as AlertStatus) ? (sp.status as AlertStatus) : undefined,
    severity: SEVERITIES.includes(sp.severity as AlertSeverity)
      ? (sp.severity as AlertSeverity)
      : undefined,
    category: CATEGORIES.includes(sp.category as AlertCategory)
      ? (sp.category as AlertCategory)
      : undefined,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-4" action="">
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="severity"
          defaultValue={sp.severity ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllSeverities')}</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={sp.category ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <AlertsTable items={items} />
    </div>
  );
}
