// CRM email outreach worker. Consumes two job types from `crm-email-outreach`:
//
//   - 'send-campaign-email': { campaignId, leadId, toEmail }
//     Sent in bulk by EmailCampaignsController.run() with delays for hourlyCap
//     ramp. Renders template, checks suppression at send time, sends via
//     Resend, updates EmailDelivery row.
//
//   - 'send-one': { leadId, toEmail, subject, templateSlug?, bodyOverride? }
//     One-off send from EmailActionsController.sendOne (lead detail "Send
//     email" button). Same pipeline minus the campaign association.
//
// All outbound emails get the same auto-injected footer with one-click
// unsubscribe link (RFC 8058 List-Unsubscribe-Post header so Gmail shows the
// native "Unsubscribe" button).
//
// Auto-refill cron (5-min tick): re-checks each RUNNING campaign's audience
// filter and queues newly-matched leads continuing the same cap-paced schedule
// (no burst). Closes the gap where CRM discovery brings in fresh leads that
// would otherwise sit forever in NEW status because the campaign run() is a
// one-shot snapshot.

import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { randomUUID, createHmac } from 'node:crypto';
import { Resend } from 'resend';
import { LeadStatus, LeadType, type PrismaClient, type Prisma } from '@aiagg/db';

const QUEUE = 'crm-email-outreach';

interface BaseJob {
  leadId: string;
  toEmail: string;
}
interface CampaignJob extends BaseJob {
  campaignId: string;
}
interface OneOffJob extends BaseJob {
  subject: string;
  templateSlug?: string;
  bodyOverride?: string;
}

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const isTls = u.protocol === 'rediss:';
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    ...(isTls ? { tls: {} } : {}),
  };
}

const TYPE_LABEL: Record<string, string> = {
  TELEGRAM_CHANNEL: 'telegram channel',
  MOBILE_APP_IOS: 'iOS app',
  MOBILE_APP_ANDROID: 'Android app',
  WEBSITE: 'website',
  OTHER: 'project',
};

function renderTemplate(template: string, lead: {
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  telegramUsername: string | null;
  url: string | null;
  type: string;
  score: number;
}): string {
  const tg = lead.telegramUsername ?? '';
  const vars: Record<string, string> = {
    name: lead.name,
    ownerName: lead.ownerName ?? lead.name ?? 'there',
    ownerEmail: lead.ownerEmail ?? '',
    telegramUsername: tg ? `@${tg.replace(/^@/, '')}` : '',
    url: lead.url ?? '',
    type: TYPE_LABEL[lead.type] ?? String(lead.type).toLowerCase(),
    topic: TYPE_LABEL[lead.type] ?? String(lead.type).toLowerCase(),
    score: String(lead.score),
  };
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full,
  );
}

function makeUnsubscribeToken(deliveryId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(deliveryId).digest('base64url');
  return `${deliveryId}.${sig}`;
}

function appendFooter(body: string, unsubscribeUrl: string): string {
  return `${body.trim()}\n\n--\nReply directly to this email if interested.\nNot interested? Unsubscribe: ${unsubscribeUrl}`;
}

// Mirror of the `AudienceFilter` shape persisted by EmailCampaignsController.
// Keep in sync with apps/api/src/modules/crm-email/email-campaigns.controller.ts.
interface AudienceFilter {
  type?: LeadType;
  minScore?: number;
  sourceId?: string;
  status?: LeadStatus;
}

function buildLeadWhere(f: AudienceFilter): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    ownerEmail: { not: null },
  };
  if (f.type && (Object.values(LeadType) as string[]).includes(f.type)) {
    where.type = f.type;
  }
  if (f.sourceId) where.sourceId = f.sourceId;
  if (f.status && (Object.values(LeadStatus) as string[]).includes(f.status)) {
    where.status = f.status;
  }
  if (typeof f.minScore === 'number') {
    where.score = { gte: f.minScore };
  }
  return where;
}

const REFILL_TICK_MS = 5 * 60 * 1000;

export interface CrmEmailHandle {
  worker: Worker;
  refillTimer: NodeJS.Timeout;
  close: () => Promise<void>;
}

export function createCrmEmailWorker(opts: {
  redisUrl: string;
  prisma: PrismaClient;
  apiKey: string;
  fromAddress: string;
  replyTo?: string;
  unsubscribeBaseUrl: string;
  unsubscribeTokenSecret: string;
}): CrmEmailHandle {
  const connection = parseRedisUrl(opts.redisUrl);
  const resend = new Resend(opts.apiKey);
  // Same queue the worker consumes from — used by the refill cron below to
  // enqueue newly-discovered leads for RUNNING campaigns.
  const queue = new Queue(QUEUE, { connection });

  const worker = new Worker(
    QUEUE,
    async (job) => {
      const log = (m: string) => console.log(`[crm-email] ${job.id} ${m}`);

      const data = job.data as CampaignJob | OneOffJob;
      const lead = await opts.prisma.lead.findUnique({
        where: { id: data.leadId },
      });
      if (!lead) {
        log(`lead ${data.leadId} not found`);
        return { ok: false, reason: 'lead_not_found' };
      }
      const toEmail = (data.toEmail || lead.ownerEmail || '').toLowerCase();
      if (!toEmail) return { ok: false, reason: 'no_email' };

      // Suppression check (bouncing back here = belt-and-suspenders since
      // controller already filters; covers race when something gets added
      // between queueing and processing).
      const sup = await opts.prisma.emailSuppression.findUnique({
        where: { email: toEmail },
      });
      if (sup && (!sup.expiresAt || sup.expiresAt > new Date())) {
        log(`skipping suppressed ${toEmail} (${sup.reason})`);
        await opts.prisma.emailDelivery.create({
          data: {
            campaignId: 'campaignId' in data ? data.campaignId : null,
            leadId: lead.id,
            toEmail,
            subject: '(skipped — suppressed)',
            status: 'SKIPPED',
            errorMessage: `suppression: ${sup.reason}`,
            unsubscribeToken: randomUUID(),
          },
        });
        return { ok: false, reason: 'suppressed' };
      }

      // Resolve template + subject
      let subject: string;
      let bodyTemplate: string;
      let campaignId: string | null = null;

      if ('campaignId' in data) {
        campaignId = data.campaignId;
        const campaign = await opts.prisma.emailCampaign.findUnique({
          where: { id: campaignId },
        });
        if (!campaign) {
          log(`campaign ${campaignId} missing — abort`);
          return { ok: false, reason: 'campaign_missing' };
        }
        // Honor pause/cancel issued after queuing.
        if (campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
          log(`campaign ${campaignId} is ${campaign.status} — skip`);
          return { ok: false, reason: `campaign_${campaign.status.toLowerCase()}` };
        }
        const tpl = await opts.prisma.outreachTemplate.findUnique({
          where: { slug: campaign.templateSlug },
        });
        if (!tpl) {
          log(`template ${campaign.templateSlug} missing`);
          return { ok: false, reason: 'template_missing' };
        }
        subject = campaign.subject;
        bodyTemplate = tpl.body;
      } else {
        const oneOff = data as OneOffJob;
        subject = oneOff.subject;
        if (oneOff.templateSlug) {
          const tpl = await opts.prisma.outreachTemplate.findUnique({
            where: { slug: oneOff.templateSlug },
          });
          if (!tpl) return { ok: false, reason: 'template_missing' };
          bodyTemplate = tpl.body;
        } else if (oneOff.bodyOverride) {
          bodyTemplate = oneOff.bodyOverride;
        } else {
          return { ok: false, reason: 'no_body' };
        }
      }

      const renderedSubject = renderTemplate(subject, lead);
      const renderedBody = renderTemplate(bodyTemplate, lead);

      // Create EmailDelivery in QUEUED → SENDING → SENT (so even if Resend
      // call fails, we keep an audit row).
      const unsubscribeToken = '__placeholder__'; // patched below post-create
      const delivery = await opts.prisma.emailDelivery.create({
        data: {
          campaignId,
          leadId: lead.id,
          toEmail,
          subject: renderedSubject,
          status: 'SENDING',
          unsubscribeToken: randomUUID(), // temp; we'll overwrite with HMAC
        },
      });
      const finalToken = makeUnsubscribeToken(delivery.id, opts.unsubscribeTokenSecret);
      await opts.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { unsubscribeToken: finalToken },
      });
      const unsubscribeUrl = `${opts.unsubscribeBaseUrl.replace(/\/$/, '')}/u/${finalToken}`;
      void unsubscribeToken; // keep var for clarity

      const finalBody = appendFooter(renderedBody, unsubscribeUrl);

      try {
        const headers: Record<string, string> = {
          // RFC 8058: one-click unsubscribe — Gmail/Outlook will show native button
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        };
        const sendArgs: Parameters<typeof resend.emails.send>[0] = {
          from: opts.fromAddress,
          to: toEmail,
          subject: renderedSubject,
          text: finalBody,
          headers,
          tags: [{ name: 'delivery_id', value: delivery.id }],
        };
        if (opts.replyTo) {
          (sendArgs as { replyTo?: string }).replyTo = opts.replyTo;
        }
        const { data: sent, error } = await resend.emails.send(sendArgs);
        if (error) throw new Error(error.message);
        if (!sent?.id) throw new Error('Resend returned no message id');

        await opts.prisma.$transaction(async (tx) => {
          await tx.emailDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'SENT',
              resendId: sent.id,
              sentAt: new Date(),
            },
          });
          if (campaignId) {
            await tx.emailCampaign.update({
              where: { id: campaignId },
              data: { totalSent: { increment: 1 } },
            });
          }
          // Move lead NEW/READY → CONTACTED
          if (lead.status === 'NEW' || lead.status === 'ENRICHED' || lead.status === 'READY') {
            await tx.lead.update({
              where: { id: lead.id },
              data: {
                status: 'CONTACTED',
                statusChangedAt: new Date(),
                contactedAt: lead.contactedAt ?? new Date(),
              },
            });
            await tx.leadStatusEvent.create({
              data: {
                leadId: lead.id,
                fromStatus: lead.status,
                toStatus: 'CONTACTED',
                changedBySystem: 'crm-email',
                reason: campaignId
                  ? `email campaign ${campaignId}`
                  : 'one-off email',
              },
            });
          }
        });
        log(`sent → ${toEmail} (resendId=${sent.id})`);
        return { ok: true, resendId: sent.id };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await opts.prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', errorMessage: msg.slice(0, 500) },
        });
        log(`send failed → ${toEmail}: ${msg}`);
        throw e;
      }
    },
    {
      connection,
      // BullMQ rate-limit at worker level — defense-in-depth on top of the
      // per-job delays scheduled by the controller. Keeps us from accidentally
      // spamming Resend if delays misfire.
      concurrency: 4,
      limiter: { max: 60, duration: 60_000 }, // 1/sec sustained
    },
  );

  // Auto-refill cron: every REFILL_TICK_MS, walk RUNNING campaigns and queue
  // any newly-matching leads (e.g. ones added by `· daily` discovery sources
  // after the campaign first ran). Idempotent via jobId=campaign:{id}:{leadId}
  // and an explicit EmailDelivery existence check, so the same lead is never
  // queued twice. New jobs are scheduled AFTER the previously-queued ones so
  // the cap rhythm continues without bursts.
  const refillTimer = setInterval(() => {
    void (async () => {
      try {
        const campaigns = await opts.prisma.emailCampaign.findMany({
          where: { status: 'RUNNING', startedAt: { not: null } },
        });
        for (const c of campaigns) {
          const filter = c.audienceFilter as unknown as AudienceFilter;
          const where = buildLeadWhere(filter);
          const leads = await opts.prisma.lead.findMany({
            where,
            select: { id: true, ownerEmail: true },
          });
          if (leads.length === 0) continue;

          const lowercaseEmails = leads
            .map((l) => l.ownerEmail?.toLowerCase())
            .filter((e): e is string => Boolean(e));
          const suppressed = lowercaseEmails.length
            ? await opts.prisma.emailSuppression.findMany({
                where: { email: { in: lowercaseEmails } },
                select: { email: true },
              })
            : [];
          const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

          // Any non-FAILED/non-SKIPPED delivery row means we already touched
          // this lead for this campaign — skip.
          const already = await opts.prisma.emailDelivery.findMany({
            where: {
              campaignId: c.id,
              leadId: { in: leads.map((l) => l.id) },
              status: { notIn: ['FAILED', 'SKIPPED'] },
            },
            select: { leadId: true },
          });
          const alreadySet = new Set(already.map((a) => a.leadId));

          const newLeads = leads.filter(
            (l) =>
              l.ownerEmail &&
              !suppressedSet.has(l.ownerEmail.toLowerCase()) &&
              !alreadySet.has(l.id),
          );
          if (newLeads.length === 0) continue;

          // Continue the same cap-paced schedule the controller's run() set up:
          // the N-th delivery is expected at startedAt + N*slotMs, so the next
          // free slot for a new lead is startedAt + totalAudience*slotMs.
          // max(…, now) handles the case where original sends already finished.
          const cap = c.hourlyCap;
          const slotMs = Math.floor(3_600_000 / cap);
          const startedMs = c.startedAt ? c.startedAt.getTime() : Date.now();
          const nowMs = Date.now();
          const baseDelay = Math.max(0, startedMs + c.totalAudience * slotMs - nowMs);

          let queued = 0;
          for (const lead of newLeads) {
            if (!lead.ownerEmail) continue;
            const delay = baseDelay + queued * slotMs;
            await queue.add(
              'send-campaign-email',
              {
                campaignId: c.id,
                leadId: lead.id,
                toEmail: lead.ownerEmail,
              },
              {
                delay,
                attempts: 3,
                backoff: { type: 'exponential', delay: 60_000 },
                removeOnComplete: 1000,
                removeOnFail: 1000,
                // Same dedup key as the controller's initial run() — prevents
                // duplicates if a lead somehow ends up in both pipelines.
                jobId: `campaign:${c.id}:${lead.id}`,
              },
            );
            queued++;
          }

          if (queued > 0) {
            await opts.prisma.emailCampaign.update({
              where: { id: c.id },
              data: { totalAudience: { increment: queued } },
            });
            console.log(
              `[crm-email-refill] campaign=${c.id} queued ${queued} new leads (baseDelay=${Math.round(baseDelay / 60_000)}min)`,
            );
          }
        }
      } catch (e) {
        console.error('[crm-email-refill] tick failed:', e);
      }
    })();
  }, REFILL_TICK_MS);

  const close = async () => {
    clearInterval(refillTimer);
    try {
      await worker.close();
    } catch {
      /* swallow */
    }
    try {
      await queue.close();
    } catch {
      /* swallow */
    }
  };
  return { worker, refillTimer, close };
}
