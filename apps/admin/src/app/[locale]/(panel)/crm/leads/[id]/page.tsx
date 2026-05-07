import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { LeadActionsBar } from '@/components/crm/LeadActionsBar';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

const TYPE_LABELS: Record<string, string> = {
  TELEGRAM_CHANNEL: 'TG канал',
  MOBILE_APP_IOS: 'iOS app',
  MOBILE_APP_ANDROID: 'Android app',
  WEBSITE: 'Сайт',
  OTHER: 'Другое',
};

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  let lead: Awaited<ReturnType<typeof serverApi.adminGetLead>>;
  try {
    lead = await serverApi.adminGetLead(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/crm/leads"
              className="mb-2 inline-block text-xs text-muted-foreground hover:text-foreground"
            >
              ← Доска
            </Link>
            <h1 className="break-words text-2xl font-semibold tracking-tight">
              {lead.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">
                {TYPE_LABELS[lead.type] ?? lead.type}
              </span>
              {lead.source ? (
                <span className="rounded bg-muted px-1.5 py-0.5">
                  {lead.source.name}
                </span>
              ) : null}
              {lead.score > 0 ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                  score {lead.score}
                </span>
              ) : null}
            </div>
          </div>
          {lead.url ? (
            <Button asChild variant="outline" size="sm">
              <a href={lead.url} target="_blank" rel="noopener noreferrer">
                Открыть источник ↗
              </a>
            </Button>
          ) : null}
        </header>

        <section className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card p-4 text-sm">
          <Field label="External ID" value={lead.externalId} mono />
          <Field label="Telegram" value={lead.telegramUsername ?? '—'} mono />
          <Field label="Email" value={lead.ownerEmail ?? '—'} mono />
          <Field label="Owner" value={lead.ownerName ?? '—'} />
          <Field label="Website" value={lead.ownerWebsite ?? '—'} mono />
          <Field label="Created" value={fmt(lead.createdAt)} />
          <Field label="Status changed" value={fmt(lead.statusChangedAt)} />
          <Field label="Contacted" value={fmt(lead.contactedAt)} />
          <Field label="First reply" value={fmt(lead.firstReplyAt)} />
          <Field label="Won at" value={fmt(lead.wonAt)} />
        </section>

        {lead.draftMessage ? (
          <section className="rounded-md border border-border bg-card">
            <header className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Черновик первого сообщения
            </header>
            <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-sm">
              {lead.draftMessage}
            </pre>
          </section>
        ) : null}

        <section className="rounded-md border border-border bg-card">
          <header className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Переписка
          </header>
          {lead.conversation ? (
            <div className="space-y-3 p-4">
              {lead.conversation.outreachAccount ? (
                <div className="text-xs text-muted-foreground">
                  Через аккаунт{' '}
                  <span className="font-mono">
                    {lead.conversation.outreachAccount.name}
                  </span>{' '}
                  ({lead.conversation.outreachAccount.phone})
                </div>
              ) : null}
              <div className="space-y-2">
                {lead.conversation.messages.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Сообщений пока нет
                  </div>
                ) : (
                  lead.conversation.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${
                        m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                          m.direction === 'OUTBOUND'
                            ? 'bg-primary/10 text-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span>{m.author}</span>
                          <span>·</span>
                          <span>{fmt(m.sentAt ?? m.createdAt)}</span>
                          {m.claudeConfidence != null ? (
                            <span className="ml-1 rounded bg-amber-500/15 px-1 text-amber-600">
                              conf {String(m.claudeConfidence)}
                            </span>
                          ) : null}
                        </div>
                        <div className="whitespace-pre-wrap">{m.body}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Переписка ещё не начата
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-card">
            <header className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Заметки ({lead.notes.length})
            </header>
            <ul className="divide-y divide-border">
              {lead.notes.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Нет заметок
                </li>
              ) : (
                lead.notes.map((n) => (
                  <li key={n.id} className="px-4 py-3 text-sm">
                    <div className="text-xs text-muted-foreground">
                      {fmt(n.createdAt)}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap">{n.body}</div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-md border border-border bg-card">
            <header className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              История статусов ({lead.statusEvents.length})
            </header>
            <ul className="divide-y divide-border">
              {lead.statusEvents.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Нет событий
                </li>
              ) : (
                lead.statusEvents.map((ev) => (
                  <li key={ev.id} className="px-4 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">
                        {ev.fromStatus ?? '—'} → {ev.toStatus}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmt(ev.createdAt)}
                      </span>
                    </div>
                    {ev.reason ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {ev.reason}
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <LeadActionsBar leadId={lead.id} currentStatus={lead.status} />
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
        {value}
      </div>
    </div>
  );
}
