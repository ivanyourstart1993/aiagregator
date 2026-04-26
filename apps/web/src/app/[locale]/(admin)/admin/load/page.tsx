import { getTranslations } from 'next-intl/server';
import {
  ApiError,
  serverApi,
  type DbLoad,
  type QueuesLoad,
  type RedisLoad,
} from '@/lib/server-api';
import { QueueCards } from '@/components/admin/load/QueueCards';
import { RedisStats } from '@/components/admin/load/RedisStats';
import { DbStats } from '@/components/admin/load/DbStats';
import { LoadAutoRefresh } from '@/components/admin/load/LoadAutoRefresh';

export const dynamic = 'force-dynamic';

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function AdminLoadPage() {
  const t = await getTranslations('admin.load');
  const [queues, redis, db]: [QueuesLoad | null, RedisLoad | null, DbLoad | null] =
    await Promise.all([
      safe(() => serverApi.adminLoadQueues()),
      safe(() => serverApi.adminLoadRedis()),
      safe(() => serverApi.adminLoadDb()),
    ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <LoadAutoRefresh />
      </header>

      <QueueCards data={queues} />
      <RedisStats data={redis} />
      <DbStats data={db} />
    </div>
  );
}
