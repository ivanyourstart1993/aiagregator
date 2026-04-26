import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DbLoad } from '@/lib/server-api';

export function DbStats({ data }: { data: DbLoad | null }) {
  const t = useTranslations('admin.load');
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('db')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {data.taskCounts ? (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t('dbTaskCounts')}
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.taskCounts).map(([k, v]) => (
                <div key={k} className="font-mono">
                  <span className="text-muted-foreground">{k}:</span>{' '}
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('dbReservations')} value={data.reservationCount ?? 0} />
          <Stat label={t('dbPendingDeposits')} value={data.pendingDeposits ?? 0} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
