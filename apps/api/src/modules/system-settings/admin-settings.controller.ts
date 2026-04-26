// Admin system settings API — Stage 14.
//   GET  /internal/admin/settings
//   GET  /internal/admin/settings/:key
//   PUT  /internal/admin/settings/:key             body: { value, comment? }
//   POST /internal/admin/settings/pause/generation       body: { paused: boolean }
//   POST /internal/admin/settings/pause/provider/:code   body: { paused: boolean }
//   POST /internal/admin/settings/pause/bundle/:key      body: { paused: boolean }
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { SystemSettingsService } from './system-settings.service';

interface PutBody {
  value: unknown;
  comment?: string;
}

interface PauseBody {
  paused: boolean;
}

@Controller('internal/admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  async list(): Promise<unknown> {
    const items = await this.settings.list();
    return { items };
  }

  @Get(':key')
  async get(@Param('key') key: string): Promise<unknown> {
    const row = await this.settings.getRaw(key);
    if (!row) throw new NotFoundException(`setting ${key} not found`);
    return row;
  }

  @Put(':key')
  async put(
    @Param('key') key: string,
    @Body() body: PutBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<unknown> {
    if (body === null || typeof body !== 'object' || !('value' in body)) {
      throw new BadRequestException('body.value is required');
    }
    return this.settings.set(key, body.value, user.id, body.comment);
  }

  @Post('pause/generation')
  async pauseGeneration(
    @Body() body: PauseBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<unknown> {
    return this.settings.set(
      'generation.queue.paused',
      Boolean(body?.paused),
      user.id,
    );
  }

  @Post('pause/provider/:code')
  async pauseProvider(
    @Param('code') code: string,
    @Body() body: PauseBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<unknown> {
    return this.settings.set(
      `provider.${code}.paused`,
      Boolean(body?.paused),
      user.id,
    );
  }

  @Post('pause/bundle/:key')
  async pauseBundle(
    @Param('key') key: string,
    @Body() body: PauseBody,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<unknown> {
    return this.settings.set(
      `bundle.${key}.paused`,
      Boolean(body?.paused),
      user.id,
    );
  }
}
