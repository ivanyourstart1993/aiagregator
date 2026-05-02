// Guards endpoints under /internal/* that should only ever be called by our
// own server-side workloads (Next.js, admin BFF). Requires the
// `X-Internal-Service-Secret` header to match `INTERNAL_SERVICE_SECRET` env.
//
// In non-production we allow the env var to be missing (logged once at boot)
// to keep local dev frictionless; the guard only enforces presence when the
// env var is set, which it always is in production.
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { safeEqual } from '@aiagg/shared';
import type { Request } from 'express';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  private readonly logger = new Logger(InternalServiceGuard.name);
  private warnedMissing = false;

  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_SERVICE_SECRET;
    if (!expected) {
      // Safety net: never silently allow in production.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'INTERNAL_SERVICE_SECRET is not set — refusing /internal request',
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
      return true;
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-internal-service-secret'];
    const got = Array.isArray(raw) ? raw[0] : raw;
    if (typeof got !== 'string' || !safeEqual(got, expected)) {
      throw new UnauthorizedException({
        code: 'unauthorized',
        message: 'invalid internal service secret',
      });
    }
    return true;
  }
}
