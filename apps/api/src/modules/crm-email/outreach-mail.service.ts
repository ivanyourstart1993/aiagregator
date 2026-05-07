import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { OutreachMailConfig } from '../../config/configuration';

interface SendArgs {
  to: string;
  subject: string;
  // Plain text only — HTML hurts cold-outreach deliverability significantly
  // (more spam-trigger surface, "marketing" classification by Gmail).
  text: string;
  // Optional override headers — used by the worker to inject List-Unsubscribe
  // and List-Unsubscribe-Post for one-click opt-out (RFC 8058) plus references
  // for thread-keeping if this is a follow-up.
  headers?: Record<string, string>;
  // Tag attached to the message, surfaced back in webhooks so we can correlate
  // bounce/complaint events back to our EmailDelivery row.
  externalDeliveryId?: string;
}

interface SendResult {
  resendId: string;
}

@Injectable()
export class OutreachMailService {
  private readonly logger = new Logger(OutreachMailService.name);
  private readonly cfg: OutreachMailConfig;
  private readonly resend: Resend | null;

  constructor(config: ConfigService) {
    this.cfg = config.get<OutreachMailConfig>('outreachMail') ?? {
      from: 'team@example.com',
    };
    this.resend = this.cfg.apiKey ? new Resend(this.cfg.apiKey) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.resend);
  }

  fromAddress(): string {
    return this.cfg.from;
  }

  async send(args: SendArgs): Promise<SendResult> {
    if (!this.resend) {
      throw new Error(
        'OutreachMail not configured: set RESEND_OUTREACH_API_KEY (or RESEND_API_KEY) and RESEND_OUTREACH_FROM',
      );
    }
    const headers: Record<string, string> = { ...(args.headers ?? {}) };
    // Tag the message so the webhook can map back. Resend surfaces this in the
    // webhook payload under `data.tags`.
    const tags = args.externalDeliveryId
      ? [{ name: 'delivery_id', value: args.externalDeliveryId }]
      : undefined;

    const payload: Parameters<typeof this.resend.emails.send>[0] = {
      from: this.cfg.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      headers,
      ...(tags ? { tags } : {}),
    };
    if (this.cfg.replyTo) {
      // resend-node accepts replyTo (string or string[])
      (payload as { replyTo?: string }).replyTo = this.cfg.replyTo;
    }

    const { data, error } = await this.resend.emails.send(payload);
    if (error) {
      this.logger.error(`Outreach send failed → ${args.to}: ${error.message}`);
      throw new Error(error.message);
    }
    if (!data?.id) {
      throw new Error('Resend returned no message id');
    }
    return { resendId: data.id };
  }
}
