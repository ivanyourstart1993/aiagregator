import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { EmailCampaignRowActions } from '@/components/crm/EmailCampaignRowActions';

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_DOT: Record<string, string> = {
  QUEUED: 'bg-zinc-500',
  SENDING: 'bg-blue-500',
  SENT: 'bg-cyan-500',
  DELIVERED: 'bg-emerald-500',
  BOUNCED: 'bg-rose-500',
  COMPLAINED: 'bg-red-600',
  REPLIED: 'bg-primary',
  FAILED: 'bg-amber-500',
  SKIPPED: 'bg-zinc-400',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  let data: Awaited<ReturnType<typeof serverApi.adminGetEmailCampaign>>;
  try {
    data = await serverApi.adminGetEmailCampaign(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { campaign, recentDeliveries } = data;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/crm/campaigns"
            className="mb-2 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Кампании
          </Link>
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {campaign.name}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            Шаблон <code className="rounded bg-muted px-1">{campaign.templateSlug}</code>
            {' · cap '}
            {campaign.hourlyCap}/час
          </div>
        </div>
        <EmailCampaignRowActions id={campaign.id} status={campaign.status} />
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Аудитория" value={campaign.totalAudience} />
        <Stat label="Sent" value={campaign.totalSent} />
        <Stat label="Delivered" value={campaign.totalDelivered} color="text-emerald-600" />
        <Stat label="Bounced" value={campaign.totalBounced} color="text-rose-500" />
        <Stat label="Complained" value={campaign.totalComplained} color="text-red-600" />
        <Stat label="Replied" value={campaign.totalReplied} color="text-primary" />
      </section>

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Subject
        </header>
        <div className="px-4 py-3 font-mono text-sm">{campaign.subject}</div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Последние 50 доставок
        </header>
        {recentDeliveries.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Доставок пока нет — нажми «Запустить»
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Адресат</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">Sent</th>
                  <th className="px-3 py-2 text-left">Delivered</th>
                  <th className="px-3 py-2 text-left">Reply</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentDeliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{d.toEmail}</td>
                    <td className="px-3 py-2 text-xs">{d.subject.slice(0, 40)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.sentAt)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.deliveredAt)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.repliedAt)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[d.status] ?? 'bg-muted'}`} />
                        {d.status}
                      </span>
                      {d.errorMessage ? (
                        <div className="mt-0.5 text-xs text-rose-500" title={d.errorMessage}>
                          {d.errorMessage.slice(0, 50)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${color ?? ''}`}>
        {value}
      </div>
    </div>
  );
}
