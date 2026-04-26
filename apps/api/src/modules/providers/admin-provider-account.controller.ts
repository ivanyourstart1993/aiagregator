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
import {
  Prisma,
  ProviderAccountStatus,
  UserRole,
} from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateProviderAccountDto,
  UpdateProviderAccountDto,
} from './dto/provider-account.dto';

@Controller('internal/admin/providers/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminProviderAccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('providerId') providerId?: string,
    @Query('status') statusRaw?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw?: number,
  ) {
    const pageNum = Math.max(page ?? 1, 1);
    const pageSize = Math.min(Math.max(pageSizeRaw ?? 50, 1), 200);
    const where: Prisma.ProviderAccountWhereInput = {};
    if (providerId) where.providerId = providerId;
    const allowedStatus = Object.values(ProviderAccountStatus) as string[];
    if (statusRaw && allowedStatus.includes(statusRaw)) {
      where.status = statusRaw as ProviderAccountStatus;
    }
    const [items, total] = await Promise.all([
      this.prisma.providerAccount.findMany({
        where,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerAccount.count({ where }),
    ]);
    return {
      items: items.map((a) => this.toView(a)),
      total,
      page: pageNum,
      pageSize,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({
    action: 'providers.account.create',
    targetType: 'provider_account',
  })
  async create(@Body() body: CreateProviderAccountDto) {
    const created = await this.prisma.providerAccount.create({
      data: {
        providerId: body.providerId,
        name: body.name,
        description: body.description ?? null,
        credentials: body.credentials as Prisma.InputJsonValue,
        proxyId: body.proxyId ?? null,
        status: body.status ?? ProviderAccountStatus.ACTIVE,
        rotationEnabled: body.rotationEnabled ?? true,
        dailyLimit: body.dailyLimit ?? null,
        monthlyLimit: body.monthlyLimit ?? null,
        maxConcurrentTasks: body.maxConcurrentTasks ?? 3,
        maxRequestsPerMinute: body.maxRequestsPerMinute ?? null,
        maxRequestsPerHour: body.maxRequestsPerHour ?? null,
        maxRequestsPerDay: body.maxRequestsPerDay ?? null,
        supportedModelIds: body.supportedModelIds ?? [],
        supportedMethodIds: body.supportedMethodIds ?? [],
      },
    });
    return this.toView(created);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const acc = await this.prisma.providerAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException();
    return this.toView(acc);
  }

  @Patch(':id')
  @LogAdminAction({
    action: 'providers.account.update',
    targetType: 'provider_account',
    targetIdFrom: 'params.id',
  })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProviderAccountDto,
  ) {
    const data: Prisma.ProviderAccountUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.credentials !== undefined) {
      data.credentials = body.credentials as Prisma.InputJsonValue;
    }
    if (body.proxyId !== undefined) {
      data.proxy = body.proxyId
        ? { connect: { id: body.proxyId } }
        : { disconnect: true };
    }
    if (body.status !== undefined) data.status = body.status;
    if (body.rotationEnabled !== undefined) {
      data.rotationEnabled = body.rotationEnabled;
    }
    if (body.dailyLimit !== undefined) data.dailyLimit = body.dailyLimit;
    if (body.monthlyLimit !== undefined) data.monthlyLimit = body.monthlyLimit;
    if (body.maxConcurrentTasks !== undefined) {
      data.maxConcurrentTasks = body.maxConcurrentTasks;
    }
    if (body.maxRequestsPerMinute !== undefined) {
      data.maxRequestsPerMinute = body.maxRequestsPerMinute;
    }
    if (body.maxRequestsPerHour !== undefined) {
      data.maxRequestsPerHour = body.maxRequestsPerHour;
    }
    if (body.maxRequestsPerDay !== undefined) {
      data.maxRequestsPerDay = body.maxRequestsPerDay;
    }
    if (body.supportedModelIds !== undefined) {
      data.supportedModelIds = body.supportedModelIds;
    }
    if (body.supportedMethodIds !== undefined) {
      data.supportedMethodIds = body.supportedMethodIds;
    }
    const acc = await this.prisma.providerAccount.update({
      where: { id },
      data,
    });
    return this.toView(acc);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @LogAdminAction({
    action: 'providers.account.delete',
    targetType: 'provider_account',
    targetIdFrom: 'params.id',
  })
  async remove(@Param('id') id: string): Promise<void> {
    await this.prisma.providerAccount.delete({ where: { id } });
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'providers.account.enable',
    targetType: 'provider_account',
    targetIdFrom: 'params.id',
  })
  async enable(@Param('id') id: string) {
    const acc = await this.prisma.providerAccount.update({
      where: { id },
      data: {
        status: ProviderAccountStatus.ACTIVE,
        excludedReason: null,
      },
    });
    return this.toView(acc);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'providers.account.disable',
    targetType: 'provider_account',
    targetIdFrom: 'params.id',
  })
  async disable(@Param('id') id: string) {
    const acc = await this.prisma.providerAccount.update({
      where: { id },
      data: { status: ProviderAccountStatus.MANUALLY_DISABLED },
    });
    return this.toView(acc);
  }

  private toView(a: {
    id: string;
    providerId: string;
    name: string;
    description: string | null;
    credentials: unknown;
    proxyId: string | null;
    status: ProviderAccountStatus;
    rotationEnabled: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
    maxConcurrentTasks: number | null;
    maxRequestsPerMinute: number | null;
    maxRequestsPerHour: number | null;
    maxRequestsPerDay: number | null;
    supportedModelIds: string[];
    supportedMethodIds: string[];
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorMessage: string | null;
    excludedReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    // Mask credentials in admin list responses (don't leak secrets in JSON).
    const credObj =
      a.credentials && typeof a.credentials === 'object'
        ? (a.credentials as Record<string, unknown>)
        : {};
    const masked: Record<string, unknown> = {};
    for (const k of Object.keys(credObj)) {
      const v = credObj[k];
      masked[k] =
        typeof v === 'string' && v.length > 6
          ? `${v.slice(0, 3)}***${v.slice(-2)}`
          : '***';
    }
    return {
      id: a.id,
      providerId: a.providerId,
      name: a.name,
      description: a.description,
      credentialsMasked: masked,
      proxyId: a.proxyId,
      status: a.status,
      rotationEnabled: a.rotationEnabled,
      dailyLimit: a.dailyLimit,
      monthlyLimit: a.monthlyLimit,
      maxConcurrentTasks: a.maxConcurrentTasks,
      maxRequestsPerMinute: a.maxRequestsPerMinute,
      maxRequestsPerHour: a.maxRequestsPerHour,
      maxRequestsPerDay: a.maxRequestsPerDay,
      supportedModelIds: a.supportedModelIds,
      supportedMethodIds: a.supportedMethodIds,
      lastSuccessAt: a.lastSuccessAt,
      lastErrorAt: a.lastErrorAt,
      lastErrorMessage: a.lastErrorMessage,
      excludedReason: a.excludedReason,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
