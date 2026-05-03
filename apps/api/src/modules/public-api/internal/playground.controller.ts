/**
 * Internal "playground" endpoint — lets a logged-in user submit a
 * generation from the dashboard without holding an API key. Reuses
 * GenerationsService.admit (the same code path /v1/generations uses)
 * so billing, anti-abuse, validation, and queueing behave identically;
 * only the auth surface differs (JwtAuthGuard ↔ PublicApiKeyGuard).
 */
import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateGenerationDto } from '../dto/create-generation.dto';
import type { AuthContext } from '../dto/views';
import { GenerationsService } from '../services/generations.service';

@Controller('internal/playground')
@UseGuards(JwtAuthGuard)
export class PlaygroundController {
  constructor(
    private readonly generations: GenerationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('generations')
  async submit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateGenerationDto,
  ) {
    // We need a full AuthContext for GenerationsService — pull the
    // matching User row to fill in fields that the JWT payload doesn't
    // carry (rate-limit overrides, emailVerified, etc.).
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, role: true, status: true, emailVerified: true,
        rateLimitPerMin: true, rateLimitPerDay: true,
        maxConcurrentTasks: true, maxRequestsPerDayPerUser: true,
      },
    });
    const auth: AuthContext = {
      user: {
        id: u!.id,
        email: u!.email,
        role: u!.role,
        status: u!.status,
        emailVerified: u!.emailVerified,
        rateLimitPerMin: u!.rateLimitPerMin,
        rateLimitPerDay: u!.rateLimitPerDay,
        maxConcurrentTasks: u!.maxConcurrentTasks,
        maxRequestsPerDayPerUser: u!.maxRequestsPerDayPerUser,
      },
      // Synthetic apiKey marker — provider attempt records will show
      // `playground` so we can audit / filter later.
      apiKey: { id: 'playground', userId: u!.id, prefix: 'playground' },
    };

    return this.generations.admit({
      auth,
      body,
      idempotencyKey: undefined,
    });
  }
}
