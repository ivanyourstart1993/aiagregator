import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadStatus, LeadType, Prisma, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

const ALL_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.ENRICHED,
  LeadStatus.READY,
  LeadStatus.CONTACTED,
  LeadStatus.REPLIED,
  LeadStatus.IN_DIALOG,
  LeadStatus.DEMO,
  LeadStatus.WON,
  LeadStatus.LOST_NO_REPLY,
  LeadStatus.LOST_REJECTED,
  LeadStatus.BLOCKED,
];

@Controller('internal/admin/crm/leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CrmLeadsController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /internal/admin/crm/leads — list with optional filters & paging.
  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw: number,
    @Query('q') q?: string,
    @Query('status') statusRaw?: string,
    @Query('type') typeRaw?: string,
    @Query('sourceId') sourceId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('minScore') minScoreRaw?: string,
  ) {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
    const skip = (Math.max(page, 1) - 1) * pageSize;

    const where: Prisma.LeadWhereInput = {};
    if (statusRaw && (Object.values(LeadStatus) as string[]).includes(statusRaw)) {
      where.status = statusRaw as LeadStatus;
    }
    if (typeRaw && (Object.values(LeadType) as string[]).includes(typeRaw)) {
      where.type = typeRaw as LeadType;
    }
    if (sourceId) where.sourceId = sourceId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (minScoreRaw) {
      const n = Number(minScoreRaw);
      if (Number.isFinite(n)) where.score = { gte: n };
    }
    if (q && q.trim().length > 0) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { telegramUsername: { contains: term, mode: 'insensitive' } },
        { ownerEmail: { contains: term, mode: 'insensitive' } },
        { ownerName: { contains: term, mode: 'insensitive' } },
        { externalId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ statusChangedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          source: { select: { id: true, name: true, kind: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  // GET /internal/admin/crm/leads/kanban — counts + first N items per status column.
  @Get('kanban')
  async kanban(
    @Query('limitPerColumn', new DefaultValuePipe(20), ParseIntPipe) limitRaw: number,
    @Query('q') q?: string,
    @Query('type') typeRaw?: string,
    @Query('sourceId') sourceId?: string,
  ) {
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const baseWhere: Prisma.LeadWhereInput = {};
    if (typeRaw && (Object.values(LeadType) as string[]).includes(typeRaw)) {
      baseWhere.type = typeRaw as LeadType;
    }
    if (sourceId) baseWhere.sourceId = sourceId;
    if (q && q.trim().length > 0) {
      const term = q.trim();
      baseWhere.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { telegramUsername: { contains: term, mode: 'insensitive' } },
        { ownerEmail: { contains: term, mode: 'insensitive' } },
        { externalId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const columns = await Promise.all(
      ALL_STATUSES.map(async (status) => {
        const where = { ...baseWhere, status };
        const [items, total] = await Promise.all([
          this.prisma.lead.findMany({
            where,
            take: limit,
            orderBy: [{ score: 'desc' }, { statusChangedAt: 'desc' }],
            select: {
              id: true,
              type: true,
              name: true,
              telegramUsername: true,
              ownerEmail: true,
              score: true,
              status: true,
              statusChangedAt: true,
              url: true,
              source: { select: { name: true, kind: true } },
              metadata: true,
            },
          }),
          this.prisma.lead.count({ where }),
        ]);
        return { status, total, items };
      }),
    );

    return { columns };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        source: true,
        notes: { orderBy: { createdAt: 'desc' } },
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
        conversation: {
          include: {
            outreachAccount: { select: { id: true, name: true, phone: true, status: true } },
            messages: { orderBy: { createdAt: 'asc' }, take: 200 },
          },
        },
      },
    });
    if (!lead) throw new NotFoundException({ code: 'lead_not_found' });
    return lead;
  }

  // PATCH /internal/admin/crm/leads/:id — partial update (status, assignedTo,
  // draftMessage, ownerEmail, etc.).
  @Patch(':id')
  @LogAdminAction({ action: 'crm.lead.update', targetType: 'lead', targetIdFrom: 'params.id' })
  async update(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Body()
    body: {
      status?: LeadStatus;
      assignedToId?: string | null;
      draftMessage?: string | null;
      ownerEmail?: string | null;
      ownerName?: string | null;
      telegramUsername?: string | null;
      score?: number;
      closeReason?: string | null;
      nextActionAt?: string | null;
    },
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!lead) throw new NotFoundException({ code: 'lead_not_found' });

    const data: Prisma.LeadUpdateInput = {};
    if (body.assignedToId !== undefined) {
      data.assignedToId = body.assignedToId;
    }
    if (body.draftMessage !== undefined) data.draftMessage = body.draftMessage;
    if (body.ownerEmail !== undefined) data.ownerEmail = body.ownerEmail;
    if (body.ownerName !== undefined) data.ownerName = body.ownerName;
    if (body.telegramUsername !== undefined) data.telegramUsername = body.telegramUsername;
    if (body.closeReason !== undefined) data.closeReason = body.closeReason;
    if (body.nextActionAt !== undefined) {
      data.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : null;
    }
    if (body.score !== undefined) {
      if (!Number.isInteger(body.score) || body.score < 0 || body.score > 100) {
        throw new BadRequestException('score must be int 0..100');
      }
      data.score = body.score;
    }

    let statusChanged = false;
    if (body.status && body.status !== lead.status) {
      if (!(Object.values(LeadStatus) as string[]).includes(body.status)) {
        throw new BadRequestException('invalid status');
      }
      data.status = body.status;
      data.statusChangedAt = new Date();
      if (body.status === LeadStatus.WON) data.wonAt = new Date();
      if (body.status === LeadStatus.CONTACTED) data.contactedAt = new Date();
      statusChanged = true;
    }

    const updated = await this.prisma.lead.update({ where: { id }, data });

    if (statusChanged) {
      await this.prisma.leadStatusEvent.create({
        data: {
          leadId: id,
          fromStatus: lead.status,
          toStatus: body.status as LeadStatus,
          changedById: actor.id,
          reason: body.closeReason ?? null,
        },
      });
    }

    return updated;
  }

  // POST /internal/admin/crm/leads/:id/move — kanban drag-n-drop endpoint.
  // Same effect as PATCH with { status }, but explicit, idempotent, and logged
  // separately so the audit trail makes sense.
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({ action: 'crm.lead.move', targetType: 'lead', targetIdFrom: 'params.id' })
  async move(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Body() body: { toStatus: LeadStatus; reason?: string },
  ) {
    if (!body?.toStatus || !(Object.values(LeadStatus) as string[]).includes(body.toStatus)) {
      throw new BadRequestException('toStatus required');
    }
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!lead) throw new NotFoundException({ code: 'lead_not_found' });

    if (lead.status === body.toStatus) return { id, status: lead.status, noop: true };

    const data: Prisma.LeadUpdateInput = {
      status: body.toStatus,
      statusChangedAt: new Date(),
    };
    if (body.toStatus === LeadStatus.WON) data.wonAt = new Date();
    if (body.toStatus === LeadStatus.CONTACTED) data.contactedAt = new Date();

    const [updated] = await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data }),
      this.prisma.leadStatusEvent.create({
        data: {
          leadId: id,
          fromStatus: lead.status,
          toStatus: body.toStatus,
          changedById: actor.id,
          reason: body.reason ?? null,
        },
      }),
    ]);

    return updated;
  }

  // POST /internal/admin/crm/leads — manual lead creation.
  @Post()
  @LogAdminAction({ action: 'crm.lead.create', targetType: 'lead' })
  async create(
    @Body()
    body: {
      type: LeadType;
      externalId: string;
      name: string;
      url?: string;
      telegramUsername?: string;
      ownerEmail?: string;
      ownerName?: string;
      score?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    if (!body?.type || !(Object.values(LeadType) as string[]).includes(body.type)) {
      throw new BadRequestException('type required');
    }
    if (!body.externalId || !body.name) {
      throw new BadRequestException('externalId and name required');
    }
    try {
      const lead = await this.prisma.lead.create({
        data: {
          type: body.type,
          externalId: body.externalId,
          sourceKind: 'MANUAL',
          name: body.name,
          url: body.url ?? null,
          telegramUsername: body.telegramUsername ?? null,
          ownerEmail: body.ownerEmail ?? null,
          ownerName: body.ownerName ?? null,
          score: typeof body.score === 'number' ? body.score : 0,
          metadata: body.metadata ? (body.metadata as Prisma.InputJsonValue) : undefined,
        },
      });
      return lead;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('lead already exists for this sourceKind+externalId');
      }
      throw e;
    }
  }

  @Delete(':id')
  @LogAdminAction({ action: 'crm.lead.delete', targetType: 'lead', targetIdFrom: 'params.id' })
  async remove(@Param('id') id: string) {
    try {
      await this.prisma.lead.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException({ code: 'lead_not_found' });
      }
      throw e;
    }
    return { ok: true };
  }

  // POST /internal/admin/crm/leads/:id/notes — append a free-form note.
  @Post(':id/notes')
  @LogAdminAction({ action: 'crm.lead.note', targetType: 'lead', targetIdFrom: 'params.id' })
  async addNote(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Body() body: { body: string },
  ) {
    if (!body?.body?.trim()) throw new BadRequestException('body required');
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { id: true } });
    if (!lead) throw new NotFoundException({ code: 'lead_not_found' });
    return this.prisma.leadNote.create({
      data: { leadId: id, authorId: actor.id, body: body.body.trim() },
    });
  }
}
