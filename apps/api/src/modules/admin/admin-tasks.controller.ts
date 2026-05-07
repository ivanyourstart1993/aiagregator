import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, TaskStatus, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('internal/admin/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminTasksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw: number,
    @Query('status') statusRaw?: string,
    @Query('errorCode') errorCode?: string,
    @Query('userId') userId?: string,
    @Query('userEmail') userEmail?: string,
    @Query('providerId') providerId?: string,
    @Query('methodId') methodId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
    const skip = (Math.max(page, 1) - 1) * pageSize;

    const where: Prisma.TaskWhereInput = {};
    if (statusRaw && (Object.values(TaskStatus) as string[]).includes(statusRaw)) {
      where.status = statusRaw as TaskStatus;
    }
    if (errorCode) where.errorCode = errorCode;
    if (userId) where.userId = userId;
    if (methodId) where.methodId = methodId;
    if (providerId) {
      // Task has no `method` relation — pre-resolve methodIds for this provider.
      const ids = await this.prisma.method.findMany({
        where: { providerId },
        select: { id: true },
      });
      where.methodId = { in: ids.map((m) => m.id) };
    }
    if (userEmail) {
      const users = await this.prisma.user.findMany({
        where: { email: { contains: userEmail, mode: 'insensitive' } },
        select: { id: true },
      });
      where.userId = { in: users.map((u) => u.id) };
    }
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      where.createdAt = range;
    }

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true } },
          apiRequest: { select: { id: true, bundleKey: true, idempotencyKey: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    // Resolve method/provider/model names for each task in one batch.
    const methodIds = Array.from(new Set(items.map((t) => t.methodId)));
    const methods = methodIds.length
      ? await this.prisma.method.findMany({
          where: { id: { in: methodIds } },
          include: { provider: true, model: true },
        })
      : [];
    const methodById = new Map(methods.map((m) => [m.id, m]));

    // For each task, resolve the *final* ProviderAttempt — the one that
    // actually served the result (success), or the last failed attempt if
    // the task itself failed. Pick the row with the highest attemptNumber
    // per taskId.
    const taskIds = items.map((t) => t.id);
    const attempts = taskIds.length
      ? await this.prisma.providerAttempt.findMany({
          where: { taskId: { in: taskIds } },
          orderBy: [{ taskId: 'asc' }, { attemptNumber: 'desc' }],
          select: {
            taskId: true,
            attemptNumber: true,
            providerAccountId: true,
            proxyId: true,
            status: true,
            providerAccount: { select: { id: true, name: true } },
          },
        })
      : [];
    const finalAttemptByTask = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) {
      if (!finalAttemptByTask.has(a.taskId)) finalAttemptByTask.set(a.taskId, a);
    }
    // Batch-fetch proxies referenced by final attempts (ProviderAttempt has
    // no `proxy` relation — only the FK column).
    const proxyIds = Array.from(
      new Set(
        Array.from(finalAttemptByTask.values())
          .map((a) => a.proxyId)
          .filter((x): x is string => !!x),
      ),
    );
    const proxies = proxyIds.length
      ? await this.prisma.proxy.findMany({
          where: { id: { in: proxyIds } },
          select: { id: true, name: true, host: true, port: true, country: true },
        })
      : [];
    const proxyById = new Map(proxies.map((p) => [p.id, p]));

    return {
      items: items.map((t) => {
        const m = methodById.get(t.methodId);
        const att = finalAttemptByTask.get(t.id);
        return {
          id: t.id,
          status: t.status,
          mode: t.mode,
          providerJobId: t.providerJobId,
          errorCode: t.errorCode,
          errorMessage: t.errorMessage,
          attempts: t.attempts,
          startedAt: t.startedAt,
          finishedAt: t.finishedAt,
          createdAt: t.createdAt,
          user: t.user,
          method: m
            ? {
                id: m.id,
                code: m.code,
                publicName: m.publicName,
                provider: { id: m.provider.id, code: m.provider.code, publicName: m.provider.publicName },
                model: { id: m.model.id, code: m.model.code, publicName: m.model.publicName },
              }
            : null,
          apiRequest: t.apiRequest,
          providerAccount: att?.providerAccount
            ? { id: att.providerAccount.id, name: att.providerAccount.name }
            : null,
          proxy: att?.proxyId
            ? (() => {
                const p = proxyById.get(att.proxyId);
                return p
                  ? { id: p.id, name: p.name, host: p.host, port: p.port, country: p.country }
                  : null;
              })()
            : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  @Get('errors/summary')
  async errorSummary(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const grouped = await this.prisma.task.groupBy({
      by: ['errorCode'],
      where: { status: TaskStatus.FAILED, finishedAt: { gte: since } },
      _count: { _all: true },
    });
    const items = grouped
      .map((g) => ({
        errorCode: g.errorCode ?? 'unknown',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);
    return { hours, since, items };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, role: true, status: true } },
        apiRequest: true,
      },
    });
    if (!task) throw new NotFoundException({ code: 'task_not_found' });

    const method = await this.prisma.method.findUnique({
      where: { id: task.methodId },
      include: { provider: true, model: true },
    });

    const reservation = await this.prisma.reservation.findFirst({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
    });

    const transactions = await this.prisma.transaction.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    const resultFiles = await this.prisma.resultFile.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      task: {
        id: task.id,
        status: task.status,
        mode: task.mode,
        providerJobId: task.providerJobId,
        errorCode: task.errorCode,
        errorMessage: task.errorMessage,
        attempts: task.attempts,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        resultData: task.resultData,
      },
      user: task.user,
      method: method
        ? {
            id: method.id,
            code: method.code,
            publicName: method.publicName,
            provider: {
              id: method.provider.id,
              code: method.provider.code,
              publicName: method.provider.publicName,
            },
            model: {
              id: method.model.id,
              code: method.model.code,
              publicName: method.model.publicName,
            },
          }
        : null,
      apiRequest: task.apiRequest,
      reservation,
      transactions,
      resultFiles,
    };
  }
}
