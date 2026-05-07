import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type EmailCampaignView,
  type LeadSourceView,
  type OutreachTemplateView,
} from '@/lib/server-api';
import { EmailCampaignForm } from '@/components/crm/EmailCampaignForm';
import { EmailCampaignRowActions } from '@/components/crm/EmailCampaignRowActions';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-zinc-500/15 text-zinc-500',
  RUNNING: 'bg-emerald-500/15 text-emerald-600',
  PAUSED: 'bg-amber-500/15 text-amber-600',
  COMPLETED: 'bg-blue-500/15 text-blue-500',
  CANCELLED: 'bg-rose-500/15 text-rose-500',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export default async function CrmCampaignsPage() {
  let items: EmailCampaignView[] = [];
  let configured = false;
  let fromAddress = '';
  try {
    const r = await serverApi.adminListEmailCampaigns();
    items = r.items;
    configured = r.configured;
    fromAddress = r.fromAddress;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  let templates: OutreachTemplateView[] = [];
  try {
    const r = await serverApi.adminListOutreachTemplates();
    templates = r.items.filter((t) => t.enabled);
  } catch {
    /* ignore */
  }

  let sources: LeadSourceView[] = [];
  try {
    const r = await serverApi.adminListLeadSources();
    sources = r.items;
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email кампании</h1>
          <p className="text-sm text-muted-foreground">
            Массовая рассылка по сегментам лидов через Resend. Throttling по
            часам, авто-suppress на bounce/complaint, входящие ответы попадают
            в карточку лида.
          </p>
        </div>
        <div className="text-right text-xs">
          {configured ? (
            <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-600">
              ✓ Resend настроен — отправка с {fromAddress}
            </span>
          ) : (
            <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-500">
              ✗ Resend не настроен — задать RESEND_OUTREACH_API_KEY
            </span>
          )}
        </div>
      </header>

      <section className="rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Кампания</th>
                <th className="px-4 py-2 text-left">Шаблон</th>
                <th className="px-4 py-2 text-right">Аудитория</th>
                <th className="px-4 py-2 text-right">Sent</th>
                <th className="px-4 py-2 text-right">Delivered</th>
                <th className="px-4 py-2 text-right">Bounced</th>
                <th className="px-4 py-2 text-right">Replied</th>
                <th className="px-4 py-2 text-left">Cap/h</th>
                <th className="px-4 py-2 text-left">Статус</th>
                <th className="px-4 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Кампаний нет — создай ниже.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/crm/campaigns/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {fmt(c.startedAt)} — {c.subject.slice(0, 50)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {c.templateSlug}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.totalAudience}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.totalSent}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                      {c.totalDelivered}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-500">
                      {c.totalBounced + c.totalComplained}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-primary">
                      {c.totalReplied}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {c.hourlyCap}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`rounded px-1.5 py-0.5 ${STATUS_BADGE[c.status] ?? 'bg-muted'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EmailCampaignRowActions id={c.id} status={c.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Новая кампания</h2>
        <EmailCampaignForm
          templates={templates}
          sources={sources.map((s) => ({ id: s.id, name: s.name }))}
        />
      </section>
    </div>
  );
}
