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

import { Worker, type ConnectionOptions } from 'bullmq';
import { randomUUID, createHmac } from 'node:crypto';
import { Resend } from 'resend';
import type { PrismaClient } from '@aiagg/db';

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

export interface CrmEmailHandle {
  worker: Worker;
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

  const close = async () => {
    try {
      await worker.close();
    } catch {
      /* swallow */
    }
  };
  return { worker, close };
}
