import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QueuesLoad } from '@/lib/server-api';

export function QueueCards({ data }: { data: QueuesLoad | null }) {
  const t = useTranslations('admin.load');
  if (!data) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{t('queues')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(data).map(([name, q]) => {
          if (!q) return null;
          return (
            <Card key={name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono">{name}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-xs">
                <Stat label={t('waiting')} value={q.waiting} />
                <Stat label={t('active')} value={q.active} />
                <Stat label={t('completed')} value={q.completed} />
                <Stat label={t('failed')} value={q.failed} />
                <Stat label={t('delayed')} value={q.delayed} />
                {q.paused != null ? <Stat label={t('paused')} value={q.paused} /> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
