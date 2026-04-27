import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DbLoad, DbLoadGroup } from '@/lib/server-api';

export function DbStats({ data }: { data: DbLoad | null }) {
  const t = useTranslations('admin.load');
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('db')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <Group title={t('dbTaskCounts')} group={data.tasks} />
        <Group title="API requests" group={data.apiRequests} />
      </CardContent>
    </Card>
  );
}

function Group({ title, group }: { title: string; group?: DbLoadGroup }) {
  if (!group) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {title} <span className="font-mono">total={group.total}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {Object.entries(group.byStatus).map(([k, v]) => (
          <div key={k} className="font-mono">
            <span className="text-muted-foreground">{k}:</span>{' '}
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
