import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExportType } from '@aiagg/db';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/dto/zod-pipe';
import { ExportsService } from './exports.service';

const createSchema = z.object({
  type: z.enum(['TRANSACTIONS', 'REQUESTS', 'TASKS', 'DEPOSITS']),
  format: z.enum(['csv', 'json']).default('csv'),
  filter: z.record(z.unknown()).default({}),
});

@Controller('internal/exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.exports.create({
      userId: user.id,
      type: body.type as ExportType,
      format: body.format,
      filter: body.filter,
    });
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.exports.list(user.id);
  }

  @Get(':id')
  get(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.exports.get(user.id, id);
  }
}
