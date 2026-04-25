import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ErrorCode } from '@aiagg/shared';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: CurrentUserPayload }>().user;
    if (!user) throw new ForbiddenException('Authentication required');
    if (!user.emailVerified) {
      throw new ForbiddenException({
        code: ErrorCode.EMAIL_NOT_VERIFIED,
        message: 'Email address must be verified to perform this action.',
      });
    }
    return true;
  }
}
