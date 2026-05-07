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
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  EmailCampaignStatus,
  LeadStatus,
  LeadType,
  Prisma,
  UserRole,
} from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRM_EMAIL_OUTREACH_QUEUE } from '../bullmq/queue.constants';
import { OutreachMailService } from './outreach-mail.service';

interface AudienceFilter {
  type?: LeadType;
  minScore?: number;
  sourceId?: string;
  status?: LeadStatus;
}

function buildLeadWhere(f: AudienceFilter): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    // Always require an email + not in suppression list (validated at send time too)
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

@Controller('internal/admin/crm/email-campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class EmailCampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: OutreachMailService,
    @InjectQueue(CRM_EMAIL_OUTREACH_QUEUE) private readonly queue: Queue,
  ) {}

  // GET — list campaigns with quick stats.
  @Get()
  async list() {
    const items = await this.prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      items,
      configured: this.mail.isConfigured(),
      fromAddress: this.mail.fromAddress(),
    };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const c = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    // Recent deliveries (last 50) for the detail view.
    const recent = await this.prisma.emailDelivery.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        leadId: true,
        toEmail: true,
        subject: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        bouncedAt: true,
        repliedAt: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    return { campaign: c, recentDeliveries: recent };
  }

  // POST — create draft campaign. Audience is computed lazily on `run`.
  @Post()
  @LogAdminAction({ action: 'crm.campaign.create', targetType: 'email_campaign' })
  async create(
    @CurrentUser() actor: CurrentUserPayload,
    @Body()
    body: {
      name: string;
      description?: string;
      templateSlug: string;
      subject: string;
      audienceFilter: AudienceFilter;
      hourlyCap?: number;
    },
  ) {
    if (!body?.name?.trim() || !body?.subject?.trim() || !body?.templateSlug?.trim()) {
      throw new BadRequestException('name, subject, templateSlug required');
    }
    // Validate template exists.
    const tpl = await this.prisma.outreachTemplate.findUnique({
      where: { slug: body.templateSlug },
    });
    if (!tpl) {
      throw new BadRequestException(`template "${body.templateSlug}" not found`);
    }
    if (!tpl.enabled) {
      throw new BadRequestException(`template "${body.templateSlug}" is disabled`);
    }
    const filter = body.audienceFilter ?? {};
    // Pre-count audience for the UI (separate from the run-time count which
    // re-queries to pick up new leads).
    const totalAudience = await this.prisma.lead.count({
      where: buildLeadWhere(filter),
    });
    const cap = Math.max(1, Math.min(body.hourlyCap ?? 20, 200));

    return this.prisma.emailCampaign.create({
      data: {
        name: body.name.trim(),
        description: body.description ?? null,
        templateSlug: body.templateSlug,
        subject: body.subject.trim(),
        audienceFilter: filter as unknown as Prisma.InputJsonValue,
        hourlyCap: cap,
        totalAudience,
        createdById: actor.id,
        status: 'DRAFT',
      },
    });
  }

  @Patch(':id')
  @LogAdminAction({
    action: 'crm.campaign.update',
    targetType: 'email_campaign',
    targetIdFrom: 'params.id',
  })
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      subject?: string;
      hourlyCap?: number;
      status?: EmailCampaignStatus;
    },
  ) {
    const c = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    const data: Prisma.EmailCampaignUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.hourlyCap !== undefined) {
      data.hourlyCap = Math.max(1, Math.min(body.hourlyCap, 200));
    }
    if (body.status !== undefined) {
      if (!(Object.values(EmailCampaignStatus) as string[]).includes(body.status)) {
        throw new BadRequestException('invalid status');
      }
      data.status = body.status;
    }
    return this.prisma.emailCampaign.update({ where: { id }, data });
  }

  @Delete(':id')
  @LogAdminAction({
    action: 'crm.campaign.delete',
    targetType: 'email_campaign',
    targetIdFrom: 'params.id',
  })
  async remove(@Param('id') id: string) {
    try {
      await this.prisma.emailCampaign.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException({ code: 'campaign_not_found' });
      }
      throw e;
    }
    return { ok: true };
  }

  // POST :id/run — materialise the audience into queued EmailDelivery rows
  // and enqueue worker jobs. Skips leads in suppression list, leads without
  // email, and leads that already have a non-failed delivery for this campaign.
  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @LogAdminAction({
    action: 'crm.campaign.run',
    targetType: 'email_campaign',
    targetIdFrom: 'params.id',
  })
  async run(@Param('id') id: string) {
    if (!this.mail.isConfigured()) {
      throw new BadRequestException(
        'OutreachMail not configured: set RESEND_OUTREACH_API_KEY and RESEND_OUTREACH_FROM (or RESEND_API_KEY/RESEND_FROM as fallback)',
      );
    }
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException({ code: 'campaign_not_found' });

    const filter = campaign.audienceFilter as unknown as AudienceFilter;
    const where = buildLeadWhere(filter);
    const leads = await this.prisma.lead.findMany({
      where,
      select: { id: true, ownerEmail: true },
    });

    const emails = leads.map((l) => l.ownerEmail!).filter(Boolean);
    if (emails.length === 0) {
      return { ok: true, queued: 0, skipped: 0, reason: 'audience empty' };
    }

    const suppressed = await this.prisma.emailSuppression.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

    // Skip leads that already have a non-FAILED/SKIPPED delivery for this
    // campaign (idempotent re-run).
    const already = await this.prisma.emailDelivery.findMany({
      where: {
        campaignId: id,
        leadId: { in: leads.map((l) => l.id) },
        status: { notIn: ['FAILED', 'SKIPPED'] },
      },
      select: { leadId: true },
    });
    const alreadySet = new Set(already.map((a) => a.leadId));

    let queued = 0;
    let skipped = 0;
    const now = Date.now();
    const cap = campaign.hourlyCap;
    // Spread the queued jobs evenly across the next hour (3600s) up to `cap`,
    // then continue with cap-per-hour ramp. delayMs[i] = floor(i / cap) * 3600s
    // + (i % cap) * (3600/cap) seconds.
    const slotMs = Math.floor(3_600_000 / cap);

    for (const lead of leads) {
      if (!lead.ownerEmail) {
        skipped++;
        continue;
      }
      if (suppressedSet.has(lead.ownerEmail.toLowerCase())) {
        skipped++;
        continue;
      }
      if (alreadySet.has(lead.id)) {
        skipped++;
        continue;
      }
      const delay = Math.floor(queued / cap) * 3_600_000 + (queued % cap) * slotMs;
      await this.queue.add(
        'send-campaign-email',
        {
          campaignId: id,
          leadId: lead.id,
          toEmail: lead.ownerEmail,
        },
        {
          delay,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
          jobId: `campaign:${id}:${lead.id}`, // dedup per campaign+lead
        },
      );
      queued++;
    }

    await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: 'RUNNING',
        startedAt: campaign.startedAt ?? new Date(now),
        totalAudience: leads.length,
      },
    });

    return { ok: true, queued, skipped, audienceSize: leads.length };
  }

  // POST :id/pause — pause a running campaign. Already-queued jobs continue;
  // worker checks campaign.status before sending each one and skips if PAUSED.
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'crm.campaign.pause',
    targetType: 'email_campaign',
    targetIdFrom: 'params.id',
  })
  async pause(@Param('id') id: string) {
    const c = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
  }

  // POST :id/preview — render the email for the first N leads in the audience
  // without sending. Used by the UI to sanity-check before pressing Run.
  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Param('id') id: string, @Body() body: { limit?: number }) {
    const c = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ code: 'campaign_not_found' });
    const tpl = await this.prisma.outreachTemplate.findUnique({
      where: { slug: c.templateSlug },
    });
    if (!tpl) throw new BadRequestException('template missing');
    const filter = c.audienceFilter as unknown as AudienceFilter;
    const limit = Math.min(Math.max(body?.limit ?? 3, 1), 10);
    const leads = await this.prisma.lead.findMany({
      where: buildLeadWhere(filter),
      take: limit,
    });
    const { renderTemplate } = await import('./template-render');
    return {
      from: this.mail.fromAddress(),
      template: { slug: tpl.slug, name: tpl.name },
      previews: leads.map((l) => ({
        leadId: l.id,
        leadName: l.name,
        toEmail: l.ownerEmail,
        subject: renderTemplate(c.subject, l),
        body: renderTemplate(tpl.body, l),
      })),
    };
  }
}
