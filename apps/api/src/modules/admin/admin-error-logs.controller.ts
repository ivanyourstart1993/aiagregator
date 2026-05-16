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
import { Prisma, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('internal/admin/error-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminErrorLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw: number,
    @Query('userId') userId?: string,
    @Query('userEmail') userEmail?: string,
    @Query('statusCode', new DefaultValuePipe(0), ParseIntPipe) statusCode?: number,
    @Query('errorCode') errorCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
    const skip = (Math.max(page, 1) - 1) * pageSize;

    const where: Prisma.ApiErrorLogWhereInput = {};
    if (userId) where.userId = userId;
    if (statusCode && statusCode > 0) where.statusCode = statusCode;
    if (errorCode) where.errorCode = errorCode;
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
      this.prisma.apiErrorLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.apiErrorLog.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        userId: e.userId,
        user: e.user,
        apiKeyId: e.apiKeyId,
        requestId: e.requestId,
        httpMethod: e.httpMethod,
        url: e.url,
        statusCode: e.statusCode,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        ipAddress: e.ipAddress,
        createdAt: e.createdAt,
        // stack and body intentionally omitted from list view — fetched in detail
      })),
      total,
      page,
      pageSize,
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const log = await this.prisma.apiErrorLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, role: true, status: true } },
      },
    });
    if (!log) throw new NotFoundException({ code: 'error_log_not_found' });
    return {
      id: log.id,
      userId: log.userId,
      user: log.user,
      apiKeyId: log.apiKeyId,
      requestId: log.requestId,
      httpMethod: log.httpMethod,
      url: log.url,
      statusCode: log.statusCode,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
      errorStack: log.errorStack,
      requestBodyPreview: log.requestBodyPreview,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    };
  }
}
