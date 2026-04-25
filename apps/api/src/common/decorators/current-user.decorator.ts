import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRole, UserStatus } from '@aiagg/db';

export interface CurrentUserPayload {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: Date | null;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<{ user?: CurrentUserPayload }>();
  return req.user;
});
