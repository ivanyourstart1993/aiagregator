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
import {
  EmailDeliveryStatus,
  EmailSuppressionReason,
  Prisma,
} from '@aiagg/db';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OutreachMailConfig } from '../../config/configuration';
import { verifyResendWebhook } from './svix-verify';

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    from?: string;
    subject?: string;
    bounce?: { message?: string; type?: string };
    tags?: Array<{ name: string; value: string }>;
  };
}

@Controller('webhooks/resend-outreach')
@Public()
export class ResendOutreachWebhookController {
  private readonly logger = new Logger(ResendOutreachWebhookController.name);
  private readonly secret?: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const cfg = config.get<OutreachMailConfig>('outreachMail');
    this.secret = cfg?.webhookSecret;
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
      if (!ok) {
        this.logger.warn('outreach webhook signature mismatch — rejecting');
        throw new BadRequestException('invalid signature');
      }
    } else {
      this.logger.warn(
        'RESEND_OUTREACH_WEBHOOK_SECRET unset — accepting webhooks unauthenticated (dev mode)',
      );
    }

    let evt: ResendEvent;
    try {
      evt = JSON.parse(raw) as ResendEvent;
    } catch {
      throw new BadRequestException('invalid JSON');
    }

    const resendId = evt.data?.email_id;
    if (!resendId) {
      this.logger.warn(`outreach webhook ${evt.type} without email_id — skip`);
      return { ok: true, skipped: true };
    }

    const delivery = await this.prisma.emailDelivery.findUnique({
      where: { resendId },
    });
    if (!delivery) {
      // Race: webhook arrived before our SENT update finished. Defer to a
      // 1-row backfill: if the row appears later we'll catch it via the
      // periodic resend status sync (not implemented yet — for now log).
      this.logger.warn(`no EmailDelivery for resendId=${resendId} type=${evt.type}`);
      return { ok: true, deferred: true };
    }

    const update: Prisma.EmailDeliveryUpdateInput = {};
    const leadStatusEvent: { toStatus: 'BLOCKED' | null } = { toStatus: null };
    let suppressionEmail: string | null = null;
    let suppressionReason: EmailSuppressionReason | null = null;

    switch (evt.type) {
      case 'email.delivered':
        update.status = EmailDeliveryStatus.DELIVERED;
        update.deliveredAt = new Date();
        break;
      case 'email.opened':
        update.openedAt = update.openedAt ?? new Date();
        // Don't change status (already SENT/DELIVERED)
        break;
      case 'email.bounced':
        update.status = EmailDeliveryStatus.BOUNCED;
        update.bouncedAt = new Date();
        update.errorMessage =
          evt.data?.bounce?.message ?? evt.data?.bounce?.type ?? 'bounce';
        suppressionEmail = delivery.toEmail;
        suppressionReason = 'BOUNCE';
        break;
      case 'email.complained':
        update.status = EmailDeliveryStatus.COMPLAINED;
        update.complainedAt = new Date();
        update.errorMessage = 'spam complaint';
        suppressionEmail = delivery.toEmail;
        suppressionReason = 'COMPLAINT';
        leadStatusEvent.toStatus = 'BLOCKED';
        break;
      case 'email.delivery_delayed':
      case 'email.failed':
        update.status = EmailDeliveryStatus.FAILED;
        update.errorMessage = evt.data?.bounce?.message ?? evt.type;
        break;
      default:
        // Other event types we don't act on (sent, scheduled, queued, ...).
        return { ok: true, ignored: evt.type };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.emailDelivery.update({ where: { id: delivery.id }, data: update });

      // Update campaign aggregate counters
      if (delivery.campaignId) {
        const inc: Prisma.EmailCampaignUpdateInput = {};
        if (update.status === EmailDeliveryStatus.DELIVERED) inc.totalDelivered = { increment: 1 };
        if (update.status === EmailDeliveryStatus.BOUNCED) inc.totalBounced = { increment: 1 };
        if (update.status === EmailDeliveryStatus.COMPLAINED) inc.totalComplained = { increment: 1 };
        if (Object.keys(inc).length > 0) {
          await tx.emailCampaign.update({
            where: { id: delivery.campaignId },
            data: inc,
          });
        }
      }

      if (suppressionEmail && suppressionReason) {
        await tx.emailSuppression.upsert({
          where: { email: suppressionEmail.toLowerCase() },
          update: {
            reason: suppressionReason,
            notes: update.errorMessage as string | undefined,
          },
          create: {
            email: suppressionEmail.toLowerCase(),
            reason: suppressionReason,
            notes: update.errorMessage as string | undefined,
          },
        });
      }

      if (leadStatusEvent.toStatus) {
        const lead = await tx.lead.findUnique({
          where: { id: delivery.leadId },
          select: { status: true },
        });
        if (lead && lead.status !== leadStatusEvent.toStatus) {
          await tx.lead.update({
            where: { id: delivery.leadId },
            data: {
              status: leadStatusEvent.toStatus,
              statusChangedAt: new Date(),
              closeReason: 'spam complaint',
            },
          });
          await tx.leadStatusEvent.create({
            data: {
              leadId: delivery.leadId,
              fromStatus: lead.status,
              toStatus: leadStatusEvent.toStatus,
              changedBySystem: 'resend-webhook',
              reason: 'spam complaint',
            },
          });
        }
      }
    });

    return { ok: true, type: evt.type };
  }
}
