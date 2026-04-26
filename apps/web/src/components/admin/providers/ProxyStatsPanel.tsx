import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProxyStats } from '@/lib/server-api';

export function ProxyStatsPanel({ stats }: { stats: ProxyStats | null }) {
  const t = useTranslations('admin.providers.proxies');
  if (!stats) return null;
  const items: Array<[string, string | number | null | undefined]> = [
    [t('statsRequestsToday'), stats.requestsToday ?? 0],
    [t('statsFailuresToday'), stats.failuresToday ?? 0],
    [t('statsSuccessRate'), stats.successRate != null ? `${(stats.successRate * 100).toFixed(1)}%` : '—'],
    [t('statsAvgLatency'), stats.avgLatencyMs ?? '—'],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('stats')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold">{value ?? '—'}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
