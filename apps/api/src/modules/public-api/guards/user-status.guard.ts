import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { UserStatus } from '@aiagg/db';
import {
  InvalidApiKeyError,
  UserBlockedError,
} from '../../../common/errors/public-api.errors';
import type { PublicApiRequest } from './public-api-key.guard';

/**
 * Belt-and-braces check that re-validates user status after the API-key guard
 * (Redis cache could be slightly stale). Currently a no-op extra layer; left
 * in place for forward-compat with cache invalidation strategies.
 */
@Injectable()
export class UserStatusGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<PublicApiRequest>();
    const auth = req.publicAuth;
    if (!auth) throw new InvalidApiKeyError('no_auth_context');
    if (auth.user.status !== UserStatus.ACTIVE) {
      throw new UserBlockedError(auth.user.id);
    }
    return true;
  }
}
