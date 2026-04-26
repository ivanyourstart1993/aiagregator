import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RedisLoad } from '@/lib/server-api';

export function RedisStats({ data }: { data: RedisLoad | null }) {
  const t = useTranslations('admin.load');
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('redis')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat
          label={data.connected ? t('redisConnected') : t('redisDisconnected')}
          value={data.connected ? '●' : '○'}
        />
        <Stat
          label={t('redisMemory')}
          value={data.usedMemoryBytes != null ? `${(data.usedMemoryBytes / 1_048_576).toFixed(1)} MB` : '—'}
        />
        <Stat label={t('redisOps')} value={data.ops ?? '—'} />
        <Stat label={t('redisClients')} value={data.clients ?? '—'} />
        <Stat
          label={t('redisUptime')}
          value={data.uptimeSeconds != null ? `${(data.uptimeSeconds / 60).toFixed(0)}m` : '—'}
        />
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
