import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SupportContactDto } from './dto/contact.dto';

interface AuthedReq extends Request {
  user?: { sub: string };
}

@Controller('internal/support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  // 5 messages per hour per session — keeps the form usable but blocks spam.
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  async contact(
    @Body() body: SupportContactDto,
    @Req() req: AuthedReq,
  ): Promise<{ success: true }> {
    const userId = req.user?.sub;
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true },
        })
      : null;

    const to =
      process.env.SUPPORT_EMAIL ||
      process.env.SEED_SUPERADMIN_EMAIL ||
      'support@example.com';

    const subject = `[Support] ${body.subject}`;
    const html = `
      <p><strong>From:</strong> ${escapeHtml(user?.name ?? '—')} &lt;${escapeHtml(user?.email ?? '—')}&gt;</p>
      <p><strong>User ID:</strong> ${escapeHtml(user?.id ?? '—')}</p>
      <hr/>
      <p><strong>Subject:</strong> ${escapeHtml(body.subject)}</p>
      <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(body.message)}</pre>
    `;
    const text = `From: ${user?.name ?? '—'} <${user?.email ?? '—'}>
User ID: ${user?.id ?? '—'}

Subject: ${body.subject}

${body.message}`;

    try {
      await this.mail.send({ to, subject, html, text });
      if (user?.email) {
        // Best-effort: silently ignore reply-to support being unavailable in send().
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `failed to send support message from ${user?.email ?? 'anon'}: ${msg}`,
      );
      // Surface a generic 502 so the form shows "couldn't deliver".
      throw err;
    }

    return { success: true };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
