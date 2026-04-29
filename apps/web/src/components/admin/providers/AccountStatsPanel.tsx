import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProviderAccountStats } from '@/lib/server-api';

function unitsToUsd(s: string | undefined | null): string {
  if (!s) return '$0.00';
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return `$${(n / 1_000_000_000).toFixed(2)}`;
}

export function AccountStatsPanel({ stats }: { stats: ProviderAccountStats | null }) {
  const t = useTranslations('admin.providers.accounts');
  if (!stats) return null;

  const acq = stats.acquisitionCostUnits ?? '0';
  const profit = stats.netProfitUnits ?? '0';
  const profitN = Number(profit);
  const profitClass =
    profitN > 0 ? 'text-emerald-600' : profitN < 0 ? 'text-destructive' : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Финансы (за период)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Стоимость аккаунта" value={unitsToUsd(acq)} />
          <Stat label="Выручка" value={unitsToUsd(stats.totalRevenueUnits)} />
          <Stat label="Стоимость провайдера" value={unitsToUsd(stats.totalProviderCostUnits)} />
          <Stat
            label="Чистая прибыль"
            value={unitsToUsd(profit)}
            className={profitClass}
          />
          <Stat
            label="ROI"
            value={
              stats.roiPct == null
                ? '—'
                : `${stats.roiPct > 0 ? '+' : ''}${stats.roiPct.toFixed(1)}%`
            }
            className={
              stats.roiPct == null
                ? ''
                : stats.roiPct > 0
                  ? 'text-emerald-600'
                  : 'text-destructive'
            }
          />
        </CardContent>
        {stats.breakevenAtRequest != null && stats.breakevenAtRequest > 0 ? (
          <CardContent className="border-t pt-3 text-xs text-muted-foreground">
            Окупится после ~{stats.breakevenAtRequest.toFixed(0)} успешных
            генераций
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('stats')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Запросы" value={stats.attempts ?? 0} />
          <Stat label="Успешных" value={stats.success ?? 0} />
          <Stat label="Неудачных" value={stats.failed ?? 0} />
          <Stat label="Средняя длит-ть" value={stats.avgDurationMs ? `${stats.avgDurationMs} ms` : '—'} />
          <Stat label="Сегодня" value={stats.counters?.todayRequests ?? 0} />
        </CardContent>
        {stats.errorBreakdown && Object.keys(stats.errorBreakdown).length > 0 ? (
          <CardContent className="border-t pt-3 text-xs">
            <div className="mb-1 text-muted-foreground">Ошибки</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.errorBreakdown).map(([code, n]) => (
                <span key={code} className="rounded border px-2 py-1 font-mono">
                  {code}: <span className="font-semibold">{n}</span>
                </span>
              ))}
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-lg font-semibold ${className ?? ''}`}>{value}</div>
    </div>
  );
}
