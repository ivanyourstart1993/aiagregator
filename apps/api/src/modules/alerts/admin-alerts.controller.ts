// Admin alerts API — Stage 13.
//   GET  /internal/admin/alerts              — list with filters
//   GET  /internal/admin/alerts/:id          — detail
//   POST /internal/admin/alerts/:id/acknowledge
//   POST /internal/admin/alerts/:id/resolve
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
import {
  AlertCategory,
  AlertSeverity,
  AlertStatus,
  UserRole,
} from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';

@Controller('internal/admin/alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  async list(
    @Query('status') status: string | undefined,
    @Query('severity') severity: string | undefined,
    @Query('category') category: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ): Promise<unknown> {
    return this.alerts.list({
      status: parseEnum(AlertStatus, status, 'status'),
      severity: parseEnum(AlertSeverity, severity, 'severity'),
      category: parseEnum(AlertCategory, category, 'category'),
      page,
      pageSize,
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<unknown> {
    const a = await this.alerts.getById(id);
    if (!a) throw new NotFoundException(`alert ${id} not found`);
    return a;
  }

  @Post(':id/acknowledge')
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<unknown> {
    const a = await this.alerts.getById(id);
    if (!a) throw new NotFoundException(`alert ${id} not found`);
    return this.alerts.acknowledge(id, user.id);
  }

  @Post(':id/resolve')
  async resolve(@Param('id') id: string): Promise<unknown> {
    const a = await this.alerts.getById(id);
    if (!a) throw new NotFoundException(`alert ${id} not found`);
    return this.alerts.resolve(id);
  }
}

function parseEnum<T extends Record<string, string>>(
  obj: T,
  v: string | undefined,
  field: string,
): T[keyof T] | undefined {
  if (!v) return undefined;
  const all = Object.values(obj);
  if (!all.includes(v)) {
    throw new BadRequestException(
      `invalid ${field}: must be one of ${all.join(', ')}`,
    );
  }
  return v as T[keyof T];
}
