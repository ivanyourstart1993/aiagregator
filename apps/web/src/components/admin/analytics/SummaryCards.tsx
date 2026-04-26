import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNanoToUSD } from '@/lib/money';
import type { AnalyticsSummary } from '@/lib/server-api';

interface Props {
  label: string;
  summary: AnalyticsSummary | null;
}

export function SummaryCards({ label, summary }: Props) {
  const t = useTranslations('admin.analytics');
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('revenue')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {summary ? formatNanoToUSD(summary.revenueUnits) : '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('cost')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {summary ? formatNanoToUSD(summary.costUnits) : '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('margin')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {summary ? formatNanoToUSD(summary.marginUnits) : '—'}
            {summary?.marginBps != null ? (
              <span className="ml-2 text-xs text-muted-foreground">
                {(summary.marginBps / 100).toFixed(1)}%
              </span>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('requests')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {summary?.requestsCount ?? '—'}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
