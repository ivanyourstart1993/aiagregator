import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('internal/admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw: number,
  ) {
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
    const skip = (Math.max(page, 1) - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
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
      this.prisma.user.count(),
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
  async enableSandbox(@Param('id') id: string) {
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
  async disableSandbox(@Param('id') id: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { sandboxEnabled: false },
      select: { id: true, email: true, sandboxEnabled: true },
    });
    return user;
  }
}
