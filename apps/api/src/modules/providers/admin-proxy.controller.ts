import {
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
import { Prisma, ProxyProtocol, ProxyStatus, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProxyDto, UpdateProxyDto } from './dto/proxy.dto';

@Controller('internal/admin/providers/proxies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminProxyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('status') statusRaw?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw?: number,
  ) {
    const pageNum = Math.max(page ?? 1, 1);
    const pageSize = Math.min(Math.max(pageSizeRaw ?? 50, 1), 200);
    const where: Prisma.ProxyWhereInput = {};
    const allowed = Object.values(ProxyStatus) as string[];
    if (statusRaw && allowed.includes(statusRaw)) {
      where.status = statusRaw as ProxyStatus;
    }
    const [items, total] = await Promise.all([
      this.prisma.proxy.findMany({
        where,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.proxy.count({ where }),
    ]);
    return {
      items: items.map((p) => this.toView(p)),
      total,
      page: pageNum,
      pageSize,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'providers.proxy.create', targetType: 'proxy' })
  async create(@Body() body: CreateProxyDto) {
    const created = await this.prisma.proxy.create({
      data: {
        name: body.name,
        host: body.host,
        port: body.port,
        protocol: body.protocol ?? ProxyProtocol.HTTP,
        login: body.login ?? null,
        // TODO Stage 11 full: encrypt at rest
        passwordHash: body.password ?? null,
        country: body.country ?? null,
        region: body.region ?? null,
        status: body.status ?? ProxyStatus.ACTIVE,
        comment: body.comment ?? null,
      },
    });
    return this.toView(created);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const p = await this.prisma.proxy.findUnique({ where: { id } });
    if (!p) throw new NotFoundException();
    return this.toView(p);
  }

  @Patch(':id')
  @LogAdminAction({
    action: 'providers.proxy.update',
    targetType: 'proxy',
    targetIdFrom: 'params.id',
  })
  async update(@Param('id') id: string, @Body() body: UpdateProxyDto) {
    const data: Prisma.ProxyUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.host !== undefined) data.host = body.host;
    if (body.port !== undefined) data.port = body.port;
    if (body.protocol !== undefined) data.protocol = body.protocol;
    if (body.login !== undefined) data.login = body.login;
    if (body.password !== undefined) data.passwordHash = body.password;
    if (body.country !== undefined) data.country = body.country;
    if (body.region !== undefined) data.region = body.region;
    if (body.status !== undefined) data.status = body.status;
    if (body.comment !== undefined) data.comment = body.comment;
    const p = await this.prisma.proxy.update({ where: { id }, data });
    return this.toView(p);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @LogAdminAction({
    action: 'providers.proxy.delete',
    targetType: 'proxy',
    targetIdFrom: 'params.id',
  })
  async remove(@Param('id') id: string): Promise<void> {
    await this.prisma.proxy.delete({ where: { id } });
  }

  private toView(p: {
    id: string;
    name: string;
    host: string;
    port: number;
    protocol: ProxyProtocol;
    login: string | null;
    passwordHash: string | null;
    country: string | null;
    region: string | null;
    status: ProxyStatus;
    comment: string | null;
    lastCheckAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorMessage: string | null;
    externalIp: string | null;
    latencyMs: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      name: p.name,
      host: p.host,
      port: p.port,
      protocol: p.protocol,
      login: p.login,
      hasPassword: Boolean(p.passwordHash),
      country: p.country,
      region: p.region,
      status: p.status,
      comment: p.comment,
      lastCheckAt: p.lastCheckAt,
      lastSuccessAt: p.lastSuccessAt,
      lastErrorAt: p.lastErrorAt,
      lastErrorMessage: p.lastErrorMessage,
      externalIp: p.externalIp,
      latencyMs: p.latencyMs,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
