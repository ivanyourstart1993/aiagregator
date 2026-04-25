import { applyDecorators, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { PublicApiKeyGuard } from '../guards/public-api-key.guard';
import { UserStatusGuard } from '../guards/user-status.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';

/**
 * Composite decorator for /v1 endpoints. Marks the route as @Public() (skips
 * the global JwtAuthGuard) and applies API-key auth + user-status + rate-limit
 * guards in order.
 */
export const PublicApi = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    Public(),
    UseGuards(PublicApiKeyGuard, UserStatusGuard, RateLimitGuard),
  );
