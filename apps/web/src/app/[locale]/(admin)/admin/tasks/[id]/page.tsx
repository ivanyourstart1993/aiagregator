import { notFound } from 'next/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Params {
  id: string;
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export default async function AdminTaskDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;

  let detail;
  try {
    detail = await serverApi.adminGetTask(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const { task, user, method, apiRequest, reservation, transactions, resultFiles } = detail;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/admin/tasks"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Назад к списку
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Task <span className="font-mono text-base">{task.id}</span>
        </h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Статус</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="status" value={task.status} mono />
          <Stat label="mode" value={task.mode} mono />
          <Stat label="attempts" value={String(task.attempts)} mono />
          <Stat label="providerJobId" value={task.providerJobId ?? '—'} mono />
          <Stat label="created" value={fmt(task.createdAt)} />
          <Stat label="started" value={fmt(task.startedAt)} />
          <Stat label="finished" value={fmt(task.finishedAt)} />
          <Stat label="updated" value={fmt(task.updatedAt)} />
        </CardContent>
      </Card>

      {task.errorCode ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">
              Ошибка: <span className="font-mono">{task.errorCode}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-xs">{task.errorMessage ?? ''}</pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Юзер</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="email" value={user.email} />
          <Stat label="name" value={user.name ?? '—'} />
          <Stat label="role" value={user.role} mono />
          <Stat
            label="link"
            value={<Link href={`/admin/users/${user.id}`} className="text-primary hover:underline">→</Link>}
          />
        </CardContent>
      </Card>

      {method ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Метод</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="provider" value={method.provider.code} mono />
            <Stat label="model" value={method.model.code} mono />
            <Stat label="method" value={method.code} mono />
            <Stat label="public name" value={method.publicName} />
          </CardContent>
        </Card>
      ) : null}

      {apiRequest ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ApiRequest</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-[11px]">
              {JSON.stringify(apiRequest, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {reservation ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reservation</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-[11px]">
              {JSON.stringify(reservation, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Транзакции ({transactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет</p>
          ) : (
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-[11px]">
              {JSON.stringify(transactions, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Result files ({resultFiles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {resultFiles.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет</p>
          ) : (
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-[11px]">
              {JSON.stringify(resultFiles, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {task.resultData ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">resultData (raw)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-[11px]">
              {JSON.stringify(task.resultData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={mono ? 'font-mono text-sm break-all' : 'text-sm'}>{value}</div>
    </div>
  );
}
