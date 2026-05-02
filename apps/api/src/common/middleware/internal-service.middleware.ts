// Enforces `X-Internal-Service-Secret` on every /internal/* path.
//
// Only the Next.js BFF (web + admin) and our own server-side workers should
// reach /internal/* — the prefix is server-to-server, not user-to-server.
// Adding this middleware turns the prefix into a real privilege boundary
// instead of a naming convention. Routes that are also JWT-protected gain
// one more independent line of defence (compromise the JWT secret AND
// learn the internal secret to ride past).
//
// Public-facing /v1/* and /webhooks/* paths are unaffected.
import {
  Injectable,
  Logger,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { safeEqual } from '@aiagg/shared';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class InternalServiceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(InternalServiceMiddleware.name);
  private warnedMissing = false;

  use(req: Request, _res: Response, next: NextFunction): void {
    const expected = process.env.INTERNAL_SERVICE_SECRET;
    if (!expected) {
      // In production, refuse silently-misconfigured deploys.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          `INTERNAL_SERVICE_SECRET is not set — refusing /internal request to ${req.path}`,
        );
        throw new UnauthorizedException({
          code: 'unauthorized',
          message: 'internal endpoint not configured',
        });
      }
      if (!this.warnedMissing) {
        this.warnedMissing = true;
        this.logger.warn(
          'INTERNAL_SERVICE_SECRET is not set; allowing /internal calls without secret in non-production',
        );
      }
      return next();
    }
    const raw = req.headers['x-internal-service-secret'];
    const got = Array.isArray(raw) ? raw[0] : raw;
    if (typeof got !== 'string' || !safeEqual(got, expected)) {
      throw new UnauthorizedException({
        code: 'unauthorized',
        message: 'invalid internal service secret',
      });
    }
    next();
  }
}
