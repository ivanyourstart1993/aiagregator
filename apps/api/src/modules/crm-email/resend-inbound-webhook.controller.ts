import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { LeadStatus } from '@aiagg/db';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OutreachMailConfig } from '../../config/configuration';
import { verifyResendWebhook } from './svix-verify';

// Resend Inbound payload shape (subset we care about). Full shape in their docs:
// https://resend.com/docs/dashboard/webhooks/event-types
interface ResendInboundEvent {
  type: string; // 'email.received'
  data?: {
    email_id?: string;
    from?: { name?: string; email?: string };
    to?: Array<{ email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Array<{ name: string; value: string }>;
    attachments?: Array<{
      filename?: string;
      content_type?: string;
      size?: number;
    }>;
  };
}

type HeadersList = NonNullable<NonNullable<ResendInboundEvent['data']>['headers']>;

function header(headers: HeadersList | undefined, name: string): string | null {
  if (!headers) return null;
  const lc = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === lc) return h.value ?? null;
  }
  return null;
}

// Very crude — strip quoted reply ("On Mon, ... wrote:") from plaintext to keep
// only the new content. We don't get fancy: take the first 4000 chars before
// the first quote marker we recognise.
function trimQuotedReply(text: string): string {
  const markers = [
    /\nOn\s.+?\swrote:\n/i,
    /\n>{1}\s/,
    /\n-{2,}\s*Original Message/i,
    /\nFrom:\s.+@.+\n/i,
  ];
  let cut = text.length;
  for (const m of markers) {
    const match = m.exec(text);
    if (match && match.index > 0 && match.index < cut) cut = match.index;
  }
  return text.slice(0, Math.min(cut, 4000)).trim();
}

@Controller('webhooks/resend-inbound')
@Public()
export class ResendInboundWebhookController {
  private readonly logger = new Logger(ResendInboundWebhookController.name);
  private readonly secret?: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const cfg = config.get<OutreachMailConfig>('outreachMail');
    this.secret = cfg?.inboundWebhookSecret;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: Request,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    let raw = '';
    if (Buffer.isBuffer(req.body)) {
      raw = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      raw = req.body;
    } else if (req.body && typeof req.body === 'object') {
      raw = JSON.stringify(req.body);
    }
    if (!raw) throw new BadRequestException('empty body');

    if (this.secret) {
      const ok = verifyResendWebhook({
        rawBody: raw,
        secret: this.secret,
        svixId,
        svixTimestamp,
        svixSignature,
      });
      if (!ok) throw new BadRequestException('invalid signature');
    } else {
      this.logger.warn(
        'RESEND_INBOUND_WEBHOOK_SECRET unset — accepting webhooks unauthenticated',
      );
    }

    let evt: ResendInboundEvent;
    try {
      evt = JSON.parse(raw) as ResendInboundEvent;
    } catch {
      throw new BadRequestException('invalid JSON');
    }

    if (evt.type !== 'email.received') {
      return { ok: true, ignored: evt.type };
    }
    const data = evt.data;
    if (!data) return { ok: true, ignored: 'no data' };

    const fromEmail = data.from?.email?.toLowerCase();
    if (!fromEmail) {
      this.logger.warn('inbound without from.email — skip');
      return { ok: true, skipped: 'no from' };
    }
    const subject = data.subject ?? '(no subject)';
    const text = data.text ?? '';
    const cleanedBody = text ? trimQuotedReply(text) : (data.html ?? '').slice(0, 4000);

    // Match strategy:
    // 1. References / In-Reply-To headers carry the original message-id ↔ matches our SENT email's headers.
    //    Resend sends original message-id in `<resendId>@<domain>` format.
    // 2. Fallback: lookup most recent EmailDelivery for this `fromEmail`.
    const inReplyTo = header(data.headers, 'In-Reply-To');
    const references = header(data.headers, 'References');

    let delivery: Awaited<ReturnType<typeof this.prisma.emailDelivery.findFirst>> = null;

    // Try In-Reply-To first
    const candidates = new Set<string>();
    for (const v of [inReplyTo, references]) {
      if (!v) continue;
      // References can be space-separated list of message-ids; extract <id> tokens.
      const matches = v.match(/<([^>]+)>/g);
      if (!matches) continue;
      for (const m of matches) {
        const id = m.slice(1, -1);
        // Resend message-id format: '<resend-id>@<domain>' — try both with and without domain.
        candidates.add(id);
        const at = id.indexOf('@');
        if (at > 0) candidates.add(id.slice(0, at));
      }
    }
    if (candidates.size > 0) {
      delivery = await this.prisma.emailDelivery.findFirst({
        where: { resendId: { in: [...candidates] } },
      });
    }
    // Fallback: most recent delivery to this address
    if (!delivery) {
      delivery = await this.prisma.emailDelivery.findFirst({
        where: { toEmail: { equals: fromEmail, mode: 'insensitive' } },
        orderBy: { sentAt: 'desc' },
      });
    }

    if (!delivery) {
      this.logger.warn(
        `inbound from ${fromEmail} — no matching EmailDelivery, dropping`,
      );
      return { ok: true, matched: false };
    }

    // Found the original delivery → upsert reply into Conversation/Message tied to lead.
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: delivery!.leadId },
        select: { id: true, status: true, firstReplyAt: true },
      });
      if (!lead) return;

      // Ensure conversation exists for this lead.
      const conv = await tx.conversation.upsert({
        where: { leadId: lead.id },
        update: { lastMessageAt: new Date() },
        create: {
          leadId: lead.id,
          lastMessageAt: new Date(),
        },
      });

      await tx.message.create({
        data: {
          conversationId: conv.id,
          direction: 'INBOUND',
          author: 'LEAD',
          body: `Subject: ${subject}\n\n${cleanedBody}`,
          delivered: true,
          externalMessageId: data.email_id ?? null,
          sentAt: new Date(),
        },
      });

      // Update delivery
      await tx.emailDelivery.update({
        where: { id: delivery!.id },
        data: {
          status: 'REPLIED',
          repliedAt: new Date(),
        },
      });

      // Move lead to REPLIED if it's in a pre-reply state.
      const preReply: LeadStatus[] = ['NEW', 'ENRICHED', 'READY', 'CONTACTED'];
      if (preReply.includes(lead.status)) {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: 'REPLIED',
            statusChangedAt: new Date(),
            firstReplyAt: lead.firstReplyAt ?? new Date(),
          },
        });
        await tx.leadStatusEvent.create({
          data: {
            leadId: lead.id,
            fromStatus: lead.status,
            toStatus: 'REPLIED',
            changedBySystem: 'resend-inbound',
            reason: 'inbound email reply',
          },
        });
      }

      if (delivery!.campaignId) {
        await tx.emailCampaign.update({
          where: { id: delivery!.campaignId },
          data: { totalReplied: { increment: 1 } },
        });
      }
    });

    return { ok: true, matched: true, leadId: delivery.leadId };
  }
}
