import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Stage 1 skeleton — public /v1 routes wired in Stage 6 will use this.
 * The actual passport strategy is `api-key.strategy.ts` in modules/auth.
 */
@Injectable()
export class ApiKeyAuthGuard extends AuthGuard('api-key') {}
