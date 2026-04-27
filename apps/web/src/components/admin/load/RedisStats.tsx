import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RedisLoad } from '@/lib/server-api';

function fmtUptime(s?: string): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 86400) return `${(n / 86400).toFixed(1)}d`;
  if (n >= 3600) return `${(n / 3600).toFixed(1)}h`;
  return `${Math.round(n / 60)}m`;
}

function fmtBytes(s?: string): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

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
          label={data.ok ? t('redisConnected') : t('redisDisconnected')}
          value={data.ok ? '●' : '○'}
        />
        <Stat label={t('redisMemory')} value={data.usedMemoryHuman ?? fmtBytes(data.usedMemory)} />
        <Stat label={t('redisOps')} value={data.totalCommandsProcessed ?? '—'} />
        <Stat label={t('redisClients')} value={data.connectedClients ?? '—'} />
        <Stat label={t('redisUptime')} value={fmtUptime(data.uptimeSeconds)} />
        <Stat label="role" value={data.role ?? '—'} />
        <Stat label="hits" value={data.keyspaceHits ?? '—'} />
        <Stat label="misses" value={data.keyspaceMisses ?? '—'} />
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
