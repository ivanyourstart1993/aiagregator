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

@Controller('internal/admin/files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminFilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
