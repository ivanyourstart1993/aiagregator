import { notFound } from 'next/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { Link } from '@/i18n/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ErrorLogDetailPage({ params }: Props) {
  const { id } = await params;
  let log: Awaited<ReturnType<typeof serverApi.adminGetErrorLog>> | null = null;
  try {
    log = await serverApi.adminGetErrorLog(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  if (!log) notFound();

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">
        <Link href="/error-logs" className="hover:underline">
          ← Ошибки API
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="font-mono text-lg">
          <span className="text-destructive">{log.statusCode}</span> {log.httpMethod} {log.url}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(log.createdAt).toLocaleString()} · {log.errorCode ?? 'no code'}
          {log.requestId ? ` · req ${log.requestId}` : ''}
        </p>
      </header>

      <Section title="Кто">
        <Pair label="Юзер">
          {log.user ? (
            <span>
              {log.user.email}{' '}
              <span className="text-muted-foreground">
                ({log.user.role} · {log.user.status})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">— (anonymous)</span>
          )}
        </Pair>
        <Pair label="API key">{log.apiKeyId ?? '—'}</Pair>
        <Pair label="IP">{log.ipAddress ?? '—'}</Pair>
        <Pair label="UA">
          <span className="font-mono text-xs">{log.userAgent ?? '—'}</span>
        </Pair>
      </Section>

      <Section title="Сообщение">
        <pre className="whitespace-pre-wrap break-words rounded bg-muted/30 p-3 text-xs">
          {log.errorMessage ?? '(empty)'}
        </pre>
      </Section>

      <Section title="Stack trace">
        {log.errorStack ? (
          <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-3 font-mono text-xs">
            {log.errorStack}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">Stack не записан.</p>
        )}
      </Section>

      <Section title="Request body (sanitised)">
        <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-3 font-mono text-xs">
          {log.requestBodyPreview != null
            ? JSON.stringify(log.requestBodyPreview, null, 2)
            : '(no body)'}
        </pre>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="w-24 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
