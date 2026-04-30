import { ApiError, serverApi } from '@/lib/server-api';

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export default async function LoadPage() {
  const [queues, redis, db] = await Promise.all([
    safe(() => serverApi.adminLoadQueues()),
    safe(() => serverApi.adminLoadRedis()),
    safe(() => serverApi.adminLoadDb()),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Нагрузка</h1>
        <p className="text-sm text-muted-foreground">BullMQ + Redis + DB снимок</p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Очереди</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {queues
            ? Object.entries(queues).map(([name, q]) =>
                q ? (
                  <div key={name} className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-2 font-mono text-sm">{name}</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {Object.entries(q).map(([k, v]) => (
                        <div key={k}>
                          <div className="text-muted-foreground">{k}</div>
                          <div className="font-mono text-base">{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null,
              )
            : null}
        </div>
      </section>

      {redis ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Redis</h2>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-xs md:grid-cols-4">
            <Stat label="OK" value={redis.ok ? '●' : '○'} />
            <Stat label="memory" value={redis.usedMemoryHuman ?? '—'} />
            <Stat label="clients" value={redis.connectedClients ?? '—'} />
            <Stat label="ops" value={redis.totalCommandsProcessed ?? '—'} />
            <Stat label="hits" value={redis.keyspaceHits ?? '—'} />
            <Stat label="misses" value={redis.keyspaceMisses ?? '—'} />
            <Stat label="role" value={redis.role ?? '—'} />
            <Stat label="uptime" value={redis.uptimeSeconds ?? '—'} />
          </div>
        </section>
      ) : null}

      {db ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">DB</h2>
          <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-xs">
            <div>
              <div className="text-muted-foreground">tasks total: <span className="font-mono">{db.tasks?.total}</span></div>
              <div className="mt-1 flex flex-wrap gap-3 font-mono">
                {Object.entries(db.tasks?.byStatus ?? {}).map(([k, v]) => (
                  <span key={k}>
                    <span className="text-muted-foreground">{k}:</span>{' '}
                    <span className="font-semibold">{v}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">apiRequests total: <span className="font-mono">{db.apiRequests?.total}</span></div>
              <div className="mt-1 flex flex-wrap gap-3 font-mono">
                {Object.entries(db.apiRequests?.byStatus ?? {}).map(([k, v]) => (
                  <span key={k}>
                    <span className="text-muted-foreground">{k}:</span>{' '}
                    <span className="font-semibold">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-base">{value}</div>
    </div>
  );
}
