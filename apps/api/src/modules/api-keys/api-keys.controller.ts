import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/dto/zod-pipe';
import { ApiKeysService } from './api-keys.service';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

@Controller('internal/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.keys.list(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.keys.getOne(user.id, id);
  }

  @Post()
  @UseGuards(EmailVerifiedGuard)
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createSchema))
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: z.infer<typeof createSchema>,
  ) {
    return this.keys.generate(user.id, body.name);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.keys.revoke(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.keys.delete(user.id, id);
  }
}
