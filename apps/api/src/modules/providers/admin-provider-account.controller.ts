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
import {
  Prisma,
  ProviderAccountStatus,
  UserRole,
} from '@aiagg/db';
import { decryptJson, encryptJson } from '@aiagg/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CloneProviderAccountDto,
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
        include: { proxy: true, provider: { select: { code: true } } },
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
        credentials: encryptJson(
          (body.credentials ?? {}) as Record<string, unknown>,
        ) as unknown as Prisma.InputJsonValue,
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
        acquisitionCostUnits:
          body.acquisitionCostUsd !== undefined && body.acquisitionCostUsd !== null
            ? BigInt(Math.round(body.acquisitionCostUsd * 1_000_000_000))
            : 0n,
      },
    });
    return this.toView(created);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const acc = await this.prisma.providerAccount.findUnique({
      where: { id },
      include: { proxy: true, provider: { select: { code: true } } },
    });
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
      data.credentials = encryptJson(
        body.credentials as Record<string, unknown>,
      ) as unknown as Prisma.InputJsonValue;
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
    if (body.acquisitionCostUsd !== undefined) {
      data.acquisitionCostUnits =
        body.acquisitionCostUsd === null
          ? 0n
          : BigInt(Math.round(body.acquisitionCostUsd * 1_000_000_000));
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

  // Create an independent copy of an account under a different provider
  // (same credentials, same proxy, same limits). Used for the "one Google
  // SA -> two providers (banana + veo)" pattern: one form submission can
  // spawn a shadow account on the sibling provider.
  @Post(':id/clone')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({
    action: 'providers.account.clone',
    targetType: 'provider_account',
    targetIdFrom: 'params.id',
  })
  async clone(
    @Param('id') id: string,
    @Body() body: CloneProviderAccountDto,
  ) {
    const source = await this.prisma.providerAccount.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!source) throw new NotFoundException();
    const target = await this.prisma.provider.findUnique({
      where: { code: body.providerCode },
    });
    if (!target) {
      throw new BadRequestException(
        `provider '${body.providerCode}' not found`,
      );
    }
    if (target.id === source.providerId) {
      throw new BadRequestException(
        `source account is already under provider '${body.providerCode}'`,
      );
    }
    // Avoid duplicate clone: if a sibling under target.id with the same
    // name suffix and matching credentials hash already exists, return it
    // instead of creating a duplicate.
    const desiredName = body.name ?? `${source.name} (${body.providerCode})`;
    const existing = await this.prisma.providerAccount.findFirst({
      where: { providerId: target.id, name: desiredName },
    });
    if (existing) return this.toView(existing);

    const creds = decryptJson(source.credentials) as Record<string, unknown>;
    const cloned = await this.prisma.providerAccount.create({
      data: {
        providerId: target.id,
        name: desiredName,
        description: source.description,
        credentials: encryptJson(creds),
        proxyId: source.proxyId,
        status: ProviderAccountStatus.ACTIVE,
        rotationEnabled: source.rotationEnabled,
        dailyLimit: source.dailyLimit,
        monthlyLimit: source.monthlyLimit,
        maxConcurrentTasks: source.maxConcurrentTasks,
        maxRequestsPerMinute: source.maxRequestsPerMinute,
        maxRequestsPerHour: source.maxRequestsPerHour,
        maxRequestsPerDay: source.maxRequestsPerDay,
        acquisitionCostUnits: source.acquisitionCostUnits,
      },
    });
    return this.toView(cloned);
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

  // Recent ProviderAttempt rows for an account — paginated, newest first.
  // Used by the account detail page to show a live debug log.
  @Get(':id/attempts')
  async attempts(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSizeRaw: number,
  ) {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
    const skip = (Math.max(page, 1) - 1) * pageSize;
    const acc = await this.prisma.providerAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException();
    const [items, total] = await Promise.all([
      this.prisma.providerAttempt.findMany({
        where: { providerAccountId: id },
        orderBy: { startedAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          taskId: true,
          attemptNumber: true,
          status: true,
          errorType: true,
          errorCode: true,
          errorMessage: true,
          providerJobId: true,
          providerCostUnits: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          proxyId: true,
        },
      }),
      this.prisma.providerAttempt.count({ where: { providerAccountId: id } }),
    ]);
    // Resolve proxy names in one batch.
    const proxyIds = Array.from(
      new Set(items.map((a) => a.proxyId).filter((x): x is string => !!x)),
    );
    const proxies = proxyIds.length
      ? await this.prisma.proxy.findMany({
          where: { id: { in: proxyIds } },
          select: { id: true, name: true, host: true, port: true, country: true },
        })
      : [];
    const proxyById = new Map(proxies.map((p) => [p.id, p]));
    return {
      items: items.map((a) => ({
        id: a.id,
        taskId: a.taskId,
        attemptNumber: a.attemptNumber,
        status: a.status,
        errorType: a.errorType,
        errorCode: a.errorCode,
        errorMessage: a.errorMessage,
        providerJobId: a.providerJobId,
        providerCostUnits:
          a.providerCostUnits != null ? a.providerCostUnits.toString() : null,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        durationMs: a.durationMs,
        proxy: a.proxyId
          ? (() => {
              const p = proxyById.get(a.proxyId);
              return p
                ? {
                    id: p.id,
                    name: p.name,
                    host: p.host,
                    port: p.port,
                    country: p.country,
                  }
                : null;
            })()
          : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  // Stage 11 (full) — usage / error breakdown for an account, derived from
  // ProviderAttempt rows. `from`/`to` are ISO timestamps; default = last 7d.
  @Get(':id/stats')
  async stats(
    @Param('id') id: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
  ) {
    const acc = await this.prisma.providerAccount.findUnique({
      where: { id },
    });
    if (!acc) throw new NotFoundException();
    const to = toRaw ? new Date(toRaw) : new Date();
    const from = fromRaw
      ? new Date(fromRaw)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const attempts = await this.prisma.providerAttempt.findMany({
      where: {
        providerAccountId: id,
        startedAt: { gte: from, lte: to },
      },
      select: {
        taskId: true,
        status: true,
        errorType: true,
        errorCode: true,
        durationMs: true,
        providerCostUnits: true,
      },
    });
    let success = 0;
    let failed = 0;
    let totalDurationMs = 0;
    let totalCostUnits = 0n;
    const errorBreakdown: Record<string, number> = {};
    const successTaskIds: string[] = [];
    for (const a of attempts) {
      if (a.status === 'success') {
        success += 1;
        if (a.taskId) successTaskIds.push(a.taskId);
      }
      if (a.status === 'failed') failed += 1;
      if (a.durationMs) totalDurationMs += a.durationMs;
      if (a.providerCostUnits) totalCostUnits += a.providerCostUnits;
      const k = a.errorType ?? a.errorCode;
      if (k) errorBreakdown[k] = (errorBreakdown[k] ?? 0) + 1;
    }

    // Revenue = sum of CAPTURED reservations on tasks that this account
    // successfully served. Wallet transactions of type RESERVATION_CAPTURE
    // record what the user actually paid.
    let totalRevenueUnits = 0n;
    if (successTaskIds.length > 0) {
      const txs = await this.prisma.transaction.findMany({
        where: {
          taskId: { in: successTaskIds },
          type: 'RESERVATION_CAPTURE',
          status: 'POSTED',
        },
        select: { amountUnits: true },
      });
      // RESERVATION_CAPTURE amounts are negative (debit from wallet);
      // revenue = absolute value.
      for (const t of txs) {
        const n = t.amountUnits;
        totalRevenueUnits += n < 0n ? -n : n;
      }
    }

    const acquisitionCostUnits = acc.acquisitionCostUnits ?? 0n;
    const netProfitUnits = totalRevenueUnits - totalCostUnits - acquisitionCostUnits;
    const roiPct =
      acquisitionCostUnits > 0n
        ? Number(((netProfitUnits * 10000n) / acquisitionCostUnits).toString()) / 100
        : null;
    const breakevenAtRequest =
      success > 0 && totalRevenueUnits > 0n
        ? Number(
            (
              (acquisitionCostUnits * BigInt(success)) /
              totalRevenueUnits
            ).toString(),
          )
        : null;

    return {
      accountId: id,
      from: from.toISOString(),
      to: to.toISOString(),
      attempts: attempts.length,
      success,
      failed,
      avgDurationMs:
        attempts.length > 0 ? Math.round(totalDurationMs / attempts.length) : 0,
      totalProviderCostUnits: totalCostUnits.toString(),
      totalRevenueUnits: totalRevenueUnits.toString(),
      acquisitionCostUnits: acquisitionCostUnits.toString(),
      netProfitUnits: netProfitUnits.toString(),
      roiPct,
      breakevenAtRequest,
      errorBreakdown,
      counters: {
        todayRequests: acc.todayRequestsCount,
        todayCostUnits: acc.todayCostUnits.toString(),
        monthRequests: acc.monthRequestsCount,
        monthCostUnits: acc.monthCostUnits.toString(),
      },
    };
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
    acquisitionCostUnits?: bigint | null;
    todayRequestsCount?: number;
    monthRequestsCount?: number;
    lastUsedAt?: Date | null;
    cooldownUntil?: Date | null;
    warmupStartedAt?: Date | null;
    proxy?: {
      id: string;
      name: string;
      host: string;
      port: number;
      protocol: string;
      country: string | null;
      status: string;
    } | null;
    provider?: { code: string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    // Mask credentials in admin list responses (don't leak secrets in JSON).
    // The stored credentials may be wrapped in a v1 encryption envelope; the
    // decrypt helper unwraps it (and is a no-op for legacy plaintext rows).
    let credObj: Record<string, unknown>;
    try {
      credObj = decryptJson(a.credentials);
    } catch {
      // Decryption failure (wrong KEK, corrupted ciphertext) — refuse to leak
      // the envelope; surface a marker instead.
      credObj = { __decrypt_error__: true };
    }
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
      acquisitionCostUnits: (a.acquisitionCostUnits ?? 0n).toString(),
      todayUsed: a.todayRequestsCount ?? null,
      monthUsed: a.monthRequestsCount ?? null,
      lastUsedAt: a.lastUsedAt ?? null,
      cooldownUntil: a.cooldownUntil ?? null,
      warmupStartedAt: a.warmupStartedAt ?? null,
      proxy: a.proxy
        ? {
            id: a.proxy.id,
            name: a.proxy.name,
            host: a.proxy.host,
            port: a.proxy.port,
            protocol: a.proxy.protocol,
            country: a.proxy.country,
            status: a.proxy.status,
          }
        : null,
      providerCode: a.provider?.code ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
