import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { UserRole, UserStatus } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IOREDIS_CLIENT } from '../../common/redis/redis.module';

interface RateLimitsBody {
  rateLimitPerMin?: number | null;
  rateLimitPerDay?: number | null;
  maxConcurrentTasks?: number | null;
  maxRequestsPerDayPerUser?: number | null;
}

function normaliseLimit(v: unknown, field: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new BadRequestException(`${field} must be an integer or null`);
  }
  if (v <= 0 || v > 1_000_000) {
    throw new BadRequestException(`${field} out of range (1..1_000_000)`);
  }
  return v;
}

@Controller('internal/admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Refuse if the actor (ADMIN) is trying to act on a SUPER_ADMIN target,
   * or if the target doesn't exist. SUPER_ADMIN actors may always proceed.
   * Returns the target user (so the caller doesn't re-query).
   */
  private async assertCanActOn(
    actor: CurrentUserPayload,
    targetId: string,
  ): Promise<{ id: string; role: UserRole }> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException({ code: 'user_not_found' });
    if (
      target.role === UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'ADMIN cannot act on SUPER_ADMIN',
      });
    }
    return target;
  }

  private async invalidateApiKeyCache(userId: string): Promise<void> {
    // PublicApiKeyGuard caches per-user data on the prefix key
    // `apikey:<prefix>` for ~minutes. Drop those keys so the rate-limit
    // override takes effect on the very next request.
    try {
      const keys = await this.prisma.apiKey.findMany({
        where: { userId },
        select: { prefix: true },
      });
      if (keys.length === 0) return;
      const cacheKeys = keys.map((k) => `apikey:${k.prefix}`);
      await this.redis.del(...cacheKeys);
    } catch {
      // best-effort
    }
  }

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw: number,
    @Query('q') q?: string,
    @Query('role') roleRaw?: string,
    @Query('status') statusRaw?: string,
  ) {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
    const skip = (Math.max(page, 1) - 1) * pageSize;
    const where: {
      OR?: Array<{ email?: { contains: string; mode: 'insensitive' }; name?: { contains: string; mode: 'insensitive' } }>;
      role?: UserRole;
      status?: UserStatus;
    } = {};
    if (q && q.trim().length > 0) {
      where.OR = [
        { email: { contains: q.trim(), mode: 'insensitive' } },
        { name: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }
    if (roleRaw && (Object.values(UserRole) as string[]).includes(roleRaw)) {
      where.role = roleRaw as UserRole;
    }
    if (statusRaw && (Object.values(UserStatus) as string[]).includes(statusRaw)) {
      where.status = statusRaw as UserStatus;
    }
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  // Stage 16 — sandbox toggle. When ON, GenerationsService routes the user's
  // jobs through a mock path (no real provider calls, $0 capture).
  @Post(':id/sandbox/enable')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'users.sandbox.enable',
    targetType: 'user',
    targetIdFrom: 'params.id',
  })
  async enableSandbox(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    await this.assertCanActOn(actor, id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { sandboxEnabled: true },
      select: { id: true, email: true, sandboxEnabled: true },
    });
    return user;
  }

  @Post(':id/sandbox/disable')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'users.sandbox.disable',
    targetType: 'user',
    targetIdFrom: 'params.id',
  })
  async disableSandbox(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    await this.assertCanActOn(actor, id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { sandboxEnabled: false },
      select: { id: true, email: true, sandboxEnabled: true },
    });
    return user;
  }

  // Per-user rate-limit overrides. Pass `null` to clear an override and
  // fall back to the env default. Any integer accepted; null means "use
  // global default".
  @Get(':id/rate-limits')
  async getRateLimits(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        rateLimitPerMin: true,
        rateLimitPerDay: true,
        maxConcurrentTasks: true,
        maxRequestsPerDayPerUser: true,
      },
    });
    return {
      ...u,
      // Surface env defaults so the admin UI can show "current effective"
      // numbers next to overrides.
      defaults: {
        rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 60),
        rateLimitPerDay: Number(process.env.RATE_LIMIT_PER_DAY ?? 1000),
        maxConcurrentTasks: Number(process.env.MAX_CONCURRENT_PER_USER ?? 10),
        maxRequestsPerDayPerUser: Number(
          process.env.MAX_REQUESTS_PER_DAY_PER_USER ?? 10000,
        ),
      },
    };
  }

  @Patch(':id/rate-limits')
  @LogAdminAction({
    action: 'users.rate-limits.update',
    targetType: 'user',
    targetIdFrom: 'params.id',
  })
  async setRateLimits(
    @Param('id') id: string,
    @Body() body: RateLimitsBody,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    await this.assertCanActOn(actor, id);
    const data: RateLimitsBody = {};
    const m = normaliseLimit(body.rateLimitPerMin, 'rateLimitPerMin');
    const d = normaliseLimit(body.rateLimitPerDay, 'rateLimitPerDay');
    const c = normaliseLimit(body.maxConcurrentTasks, 'maxConcurrentTasks');
    const dp = normaliseLimit(
      body.maxRequestsPerDayPerUser,
      'maxRequestsPerDayPerUser',
    );
    if (m !== undefined) data.rateLimitPerMin = m;
    if (d !== undefined) data.rateLimitPerDay = d;
    if (c !== undefined) data.maxConcurrentTasks = c;
    if (dp !== undefined) data.maxRequestsPerDayPerUser = dp;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('no fields to update');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        rateLimitPerMin: true,
        rateLimitPerDay: true,
        maxConcurrentTasks: true,
        maxRequestsPerDayPerUser: true,
      },
    });
    await this.invalidateApiKeyCache(id);
    return updated;
  }

  // Soft-anonymize: free up the unique email so the address can re-register,
  // mark the account BLOCKED, scrub identifying fields. Cheaper than a full
  // cascade delete and avoids breaking historical FK references (transactions,
  // tasks, audit logs).
  @Post(':id/anonymize')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'users.anonymize',
    targetType: 'user',
    targetIdFrom: 'params.id',
  })
  async anonymize(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    await this.assertCanActOn(actor, id);
    // Self-anonymize would lock the actor out of their own account, including
    // a SUPER_ADMIN. Refuse — must be done by another SUPER_ADMIN.
    if (actor.id === id) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'cannot anonymize yourself',
      });
    }
    const tombstone = `deleted-${Date.now()}-${id}@tombstone.local`;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: tombstone,
        name: null,
        emailVerified: null,
        status: UserStatus.DELETED,
      },
      select: { id: true, email: true, status: true },
    });
    return user;
  }
}
