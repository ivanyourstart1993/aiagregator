import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeadType, Prisma, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('internal/admin/crm/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CrmTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const items = await this.prisma.outreachTemplate.findMany({
      orderBy: [{ enabled: 'desc' }, { slug: 'asc' }],
    });
    return { items };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const item = await this.prisma.outreachTemplate.findUnique({ where: { id } });
    if (!item) throw new NotFoundException({ code: 'template_not_found' });
    return item;
  }

  @Post()
  @LogAdminAction({ action: 'crm.template.create', targetType: 'outreach_template' })
  async create(
    @Body()
    body: {
      slug: string;
      name: string;
      description?: string;
      body: string;
      targetTypes?: LeadType[];
      enabled?: boolean;
    },
  ) {
    if (!body?.slug?.trim() || !body?.name?.trim() || !body?.body?.trim()) {
      throw new BadRequestException('slug, name, body required');
    }
    const targetTypes = (body.targetTypes ?? []).filter((t) =>
      (Object.values(LeadType) as string[]).includes(t),
    ) as LeadType[];
    try {
      return await this.prisma.outreachTemplate.create({
        data: {
          slug: body.slug.trim(),
          name: body.name.trim(),
          description: body.description ?? null,
          body: body.body,
          targetTypes,
          enabled: body.enabled ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('slug already exists');
      }
      throw e;
    }
  }

  @Patch(':id')
  @LogAdminAction({ action: 'crm.template.update', targetType: 'outreach_template', targetIdFrom: 'params.id' })
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      body?: string;
      targetTypes?: LeadType[];
      enabled?: boolean;
    },
  ) {
    const existing = await this.prisma.outreachTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'template_not_found' });
    const data: Prisma.OutreachTemplateUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.body !== undefined) data.body = body.body;
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.targetTypes !== undefined) {
      data.targetTypes = body.targetTypes.filter((t) =>
        (Object.values(LeadType) as string[]).includes(t),
      ) as LeadType[];
    }
    return this.prisma.outreachTemplate.update({ where: { id }, data });
  }

  @Delete(':id')
  @LogAdminAction({ action: 'crm.template.delete', targetType: 'outreach_template', targetIdFrom: 'params.id' })
  async remove(@Param('id') id: string) {
    try {
      await this.prisma.outreachTemplate.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException({ code: 'template_not_found' });
      }
      throw e;
    }
    return { ok: true };
  }
}
