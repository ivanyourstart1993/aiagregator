import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicApiRequest } from '../guards/public-api-key.guard';
import type { AuthContext } from '../dto/views';

export const CurrentApiCaller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<PublicApiRequest>();
    if (!req.publicAuth) {
      throw new Error('CurrentApiCaller used outside of PublicApi-protected route');
    }
    return req.publicAuth;
  },
);
