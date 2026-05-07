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
import { LeadSourceKind, Prisma, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRM_DISCOVERY_QUEUE } from '../bullmq/queue.constants';

@Controller('internal/admin/crm/sources')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CrmSourcesController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CRM_DISCOVERY_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  async list() {
    const items = await this.prisma.leadSource.findMany({
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
    });
    return { items };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const item = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!item) throw new NotFoundException({ code: 'source_not_found' });
    return item;
  }

  @Post()
  @LogAdminAction({ action: 'crm.source.create', targetType: 'lead_source' })
  async create(
    @Body()
    body: {
      kind: LeadSourceKind;
      name: string;
      config: Record<string, unknown>;
      enabled?: boolean;
      intervalMinutes?: number | null;
    },
  ) {
    if (!body?.kind || !(Object.values(LeadSourceKind) as string[]).includes(body.kind)) {
      throw new BadRequestException('kind required');
    }
    if (!body.name?.trim()) throw new BadRequestException('name required');
    if (!body.config || typeof body.config !== 'object') {
      throw new BadRequestException('config object required');
    }
    return this.prisma.leadSource.create({
      data: {
        kind: body.kind,
        name: body.name.trim(),
        config: body.config as Prisma.InputJsonValue,
        enabled: body.enabled ?? true,
        intervalMinutes:
          typeof body.intervalMinutes === 'number' ? body.intervalMinutes : null,
      },
    });
  }

  @Patch(':id')
  @LogAdminAction({ action: 'crm.source.update', targetType: 'lead_source', targetIdFrom: 'params.id' })
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
      intervalMinutes?: number | null;
    },
  ) {
    const existing = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'source_not_found' });
    const data: Prisma.LeadSourceUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.config !== undefined) data.config = body.config as Prisma.InputJsonValue;
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.intervalMinutes !== undefined) data.intervalMinutes = body.intervalMinutes;
    return this.prisma.leadSource.update({ where: { id }, data });
  }

  @Delete(':id')
  @LogAdminAction({ action: 'crm.source.delete', targetType: 'lead_source', targetIdFrom: 'params.id' })
  async remove(@Param('id') id: string) {
    try {
      await this.prisma.leadSource.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException({ code: 'source_not_found' });
      }
      throw e;
    }
    return { ok: true };
  }

  // POST /internal/admin/crm/sources/:id/run — manually enqueue a discovery
  // job. Worker picks it up, runs the source, persists found leads, and
  // updates lastRunAt/lastRunStatus on the source.
  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @LogAdminAction({ action: 'crm.source.run', targetType: 'lead_source', targetIdFrom: 'params.id' })
  async run(@Param('id') id: string) {
    const source = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException({ code: 'source_not_found' });
    await this.queue.add(
      'discover',
      { sourceId: id },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    return { ok: true, queued: true };
  }
}
