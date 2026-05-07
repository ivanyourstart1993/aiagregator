import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  EmailSuppressionReason,
  Prisma,
  UserRole,
} from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRM_EMAIL_OUTREACH_QUEUE } from '../bullmq/queue.constants';
import { OutreachMailService } from './outreach-mail.service';

@Controller('internal/admin/crm/email')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class EmailActionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: OutreachMailService,
    @InjectQueue(CRM_EMAIL_OUTREACH_QUEUE) private readonly queue: Queue,
  ) {}

  // POST /internal/admin/crm/email/leads/:leadId/send
  // One-off: send a single email to a lead from the lead detail page.
  // Skips campaign association — useful for follow-ups, custom replies, etc.
  @Post('leads/:leadId/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @LogAdminAction({
    action: 'crm.email.send_one',
    targetType: 'lead',
    targetIdFrom: 'params.leadId',
  })
  async sendOne(
    @Param('leadId') leadId: string,
    @Body()
    body: {
      templateSlug?: string;
      // Either templateSlug OR explicit subject+body required.
      subject?: string;
      body?: string;
    },
  ) {
    if (!this.mail.isConfigured()) {
      throw new BadRequestException(
        'OutreachMail not configured: set RESEND_OUTREACH_API_KEY',
      );
    }
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ code: 'lead_not_found' });
    if (!lead.ownerEmail) {
      throw new BadRequestException('lead has no ownerEmail');
    }

    // Suppression check.
    const sup = await this.prisma.emailSuppression.findUnique({
      where: { email: lead.ownerEmail },
    });
    if (sup && (!sup.expiresAt || sup.expiresAt > new Date())) {
      throw new BadRequestException(`address suppressed (${sup.reason})`);
    }

    let subject = body.subject?.trim();
    let templateSlug: string | undefined;
    if (body.templateSlug) {
      const tpl = await this.prisma.outreachTemplate.findUnique({
        where: { slug: body.templateSlug },
      });
      if (!tpl) throw new BadRequestException('template not found');
      templateSlug = tpl.slug;
      // Subject defaults to a generic one if not provided + template used.
      subject = subject || `${lead.name}`.slice(0, 80);
    }
    if (!subject) throw new BadRequestException('subject required');

    await this.queue.add(
      'send-one',
      {
        leadId,
        toEmail: lead.ownerEmail,
        subject,
        templateSlug,
        bodyOverride: body.body,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
    return { ok: true, queued: true };
  }

  // GET /internal/admin/crm/email/suppressions
  @Get('suppressions')
  async listSuppressions() {
    const items = await this.prisma.emailSuppression.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { items };
  }

  @Post('suppressions')
  @LogAdminAction({
    action: 'crm.email.suppress',
    targetType: 'email_suppression',
  })
  async addSuppression(
    @Body() body: { email: string; reason?: EmailSuppressionReason; notes?: string },
  ) {
    if (!body?.email?.trim()) throw new BadRequestException('email required');
    const reason = body.reason ?? 'MANUAL';
    if (!(Object.values(EmailSuppressionReason) as string[]).includes(reason)) {
      throw new BadRequestException('invalid reason');
    }
    return this.prisma.emailSuppression.upsert({
      where: { email: body.email.toLowerCase() },
      update: { reason, notes: body.notes ?? null, expiresAt: null },
      create: {
        email: body.email.toLowerCase(),
        reason,
        notes: body.notes ?? null,
      },
    });
  }

  @Delete('suppressions/:id')
  @LogAdminAction({
    action: 'crm.email.unsuppress',
    targetType: 'email_suppression',
    targetIdFrom: 'params.id',
  })
  async removeSuppression(@Param('id') id: string) {
    try {
      await this.prisma.emailSuppression.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException({ code: 'suppression_not_found' });
      }
      throw e;
    }
    return { ok: true };
  }

  // GET /internal/admin/crm/email/leads/:leadId/deliveries — show all email
  // history for a lead (rendered on the lead detail page).
  @Get('leads/:leadId/deliveries')
  async leadDeliveries(@Param('leadId') leadId: string) {
    const items = await this.prisma.emailDelivery.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return { items };
  }
}
