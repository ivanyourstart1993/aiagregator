// Admin file management — Stage 15.
//   GET  /internal/admin/files                  ?userId=&status=&page=&pageSize=
//   GET  /internal/admin/files/:id
//   POST /internal/admin/files/:id/delete-now   — manual immediate deletion
import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, ResultFileStatus, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { FileCleanupCron } from './file-cleanup.cron';

@Controller('internal/admin/files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminFilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cleanup: FileCleanupCron,
  ) {}

  @Get()
  async list(
    @Query('userId') userId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw: number,
  ): Promise<unknown> {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
    const where: Prisma.ResultFileWhereInput = {};
    if (userId) where.userId = userId;
    if (status) {
      const all = Object.values(ResultFileStatus);
      if (!all.includes(status as ResultFileStatus)) {
        throw new BadRequestException(
          `invalid status: must be one of ${all.join(', ')}`,
        );
      }
      where.status = status as ResultFileStatus;
    }
    const [items, total] = await Promise.all([
      this.prisma.resultFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Math.max(page, 1) - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.resultFile.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<unknown> {
    const f = await this.prisma.resultFile.findUnique({ where: { id } });
    if (!f) throw new NotFoundException(`file ${id} not found`);
    return f;
  }

  // Recompute expiresAt for all AVAILABLE result files using the current
  // RESULT_TTL policy (createdAt + ttlDays). Useful after lowering retention
  // so existing files become eligible for cleanup. Returns counts.
  @Post('backfill-ttl')
  async backfillTtl(
    @Query('ttlDays', new DefaultValuePipe(1), ParseIntPipe) ttlDays: number,
  ): Promise<{ updated: number; ttlDays: number }> {
    if (ttlDays < 0 || ttlDays > 365) {
      throw new BadRequestException('ttlDays must be 0..365');
    }
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    // Fetch in pages and update only rows whose current expiresAt is later
    // than (createdAt + ttlMs). Avoids no-op writes.
    const pageSize = 1000;
    let updated = 0;
    while (true) {
      const batch = await this.prisma.resultFile.findMany({
        where: { status: ResultFileStatus.AVAILABLE },
        orderBy: { createdAt: 'asc' },
        take: pageSize,
        skip: updated,
        select: { id: true, createdAt: true, expiresAt: true },
      });
      if (batch.length === 0) break;
      const ids: { id: string; expiresAt: Date }[] = [];
      for (const f of batch) {
        const want = new Date(f.createdAt.getTime() + ttlMs);
        if (!f.expiresAt || f.expiresAt.getTime() > want.getTime()) {
          ids.push({ id: f.id, expiresAt: want });
        }
      }
      if (ids.length === 0) break;
      await this.prisma.$transaction(
        ids.map((x) =>
          this.prisma.resultFile.update({
            where: { id: x.id },
            data: { expiresAt: x.expiresAt },
          }),
        ),
      );
      updated += ids.length;
      if (batch.length < pageSize) break;
    }
    return { updated, ttlDays };
  }

  // Trigger the daily cleanup cron immediately (no need to wait for 03:00).
  @Post('run-cleanup')
  async runCleanup(): Promise<{
    tried: number;
    deleted: number;
    failed: number;
  }> {
    return this.cleanup.runOnce();
  }

  // Trigger the orphan-input sweep immediately. Useful after MinIO ran low —
  // the cron only fires at 03:00 UTC, so a manual kick clears the backlog now.
  @Post('run-input-sweep')
  async runInputSweep(): Promise<{
    scanned: number;
    deleted: number;
    failed: number;
  }> {
    return this.cleanup.sweepInputUploads();
  }

  @Post(':id/delete-now')
  async deleteNow(@Param('id') id: string): Promise<unknown> {
    const f = await this.prisma.resultFile.findUnique({ where: { id } });
    if (!f) throw new NotFoundException(`file ${id} not found`);
    if (f.status === ResultFileStatus.DELETED) {
      return { ok: true, alreadyDeleted: true };
    }
    try {
      await this.storage.delete(f.storageKey);
      await this.prisma.resultFile.update({
        where: { id },
        data: {
          status: ResultFileStatus.DELETED,
          deletedAt: new Date(),
        },
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.resultFile
        .update({
          where: { id },
          data: { status: ResultFileStatus.DELETION_FAILED },
        })
        .catch(() => undefined);
      return { ok: false, error: message };
    }
  }
}
