import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { verifyUnsubscribeToken } from './unsubscribe-token';

const PAGE_HTML = (status: 'ok' | 'invalid' | 'already', email?: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<title>Unsubscribed</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<style>
body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px;
       margin: 80px auto; padding: 24px; color: #1a1a1a; }
h1 { font-size: 1.25rem; margin: 0 0 8px; }
p { color: #555; line-height: 1.5; }
.ok { color: #047857; }
.bad { color: #b91c1c; }
</style>
</head><body>
${
  status === 'ok'
    ? `<h1 class="ok">You're unsubscribed</h1>
       <p>${email ? `<code>${email}</code>` : 'This address'} has been removed from our outreach list. We won't email you again.</p>`
    : status === 'already'
      ? `<h1 class="ok">Already unsubscribed</h1>
         <p>Nothing to do — you're already off the list.</p>`
      : `<h1 class="bad">Invalid link</h1>
         <p>This unsubscribe link is invalid or has expired. If you're still receiving emails, reply with "unsubscribe" and we'll handle it manually.</p>`
}
</body></html>`;

@Controller('u')
@Public()
export class UnsubscribeController {
  private readonly secret: string;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const cfg = config.get<AppConfig>('') as unknown as AppConfig;
    // ConfigService get('') returns undefined for some setups; fallback to direct lookup.
    this.secret =
      cfg?.unsubscribeTokenSecret ??
      (config.get<string>('unsubscribeTokenSecret') as string);
  }

  // GET /u/:token — show the page (single-click for end users), and ALSO
  // perform the unsubscribe (RFC 8058 List-Unsubscribe POST may use this URL).
  @Get(':token')
  async show(@Param('token') token: string, @Res() res: Response) {
    return this.processToken(token, res);
  }

  // POST /u/:token — for List-Unsubscribe-Post: List-Unsubscribe=One-Click.
  @Post(':token')
  @HttpCode(HttpStatus.OK)
  async post(@Param('token') token: string, @Res() res: Response) {
    return this.processToken(token, res);
  }

  private async processToken(token: string, res: Response) {
    const verified = verifyUnsubscribeToken(token, this.secret);
    if (!verified) {
      res.status(400).type('html').send(PAGE_HTML('invalid'));
      return;
    }
    const delivery = await this.prisma.emailDelivery.findUnique({
      where: { id: verified.deliveryId },
    });
    if (!delivery) {
      res.status(400).type('html').send(PAGE_HTML('invalid'));
      return;
    }

    const email = delivery.toEmail.toLowerCase();
    const existing = await this.prisma.emailSuppression.findUnique({
      where: { email },
    });
    if (existing && existing.reason === 'UNSUBSCRIBE') {
      res.status(200).type('html').send(PAGE_HTML('already', email));
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.emailSuppression.upsert({
        where: { email },
        update: { reason: 'UNSUBSCRIBE', expiresAt: null },
        create: {
          email,
          reason: 'UNSUBSCRIBE',
          notes: `via delivery ${delivery.id}`,
        },
      });
      // Mark the lead BLOCKED so we never queue more emails to them.
      const lead = await tx.lead.findUnique({
        where: { id: delivery.leadId },
        select: { status: true },
      });
      if (lead && lead.status !== 'BLOCKED') {
        await tx.lead.update({
          where: { id: delivery.leadId },
          data: {
            status: 'BLOCKED',
            statusChangedAt: new Date(),
            closeReason: 'unsubscribed via email link',
          },
        });
        await tx.leadStatusEvent.create({
          data: {
            leadId: delivery.leadId,
            fromStatus: lead.status,
            toStatus: 'BLOCKED',
            changedBySystem: 'unsubscribe-link',
            reason: 'recipient clicked unsubscribe',
          },
        });
      }
    });

    res.status(200).type('html').send(PAGE_HTML('ok', email));
  }
}
