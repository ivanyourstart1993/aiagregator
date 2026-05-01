import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { IOREDIS_CLIENT } from '../../../common/redis/redis.module';
import { RateLimitExceededError } from '../../../common/errors/public-api.errors';
import type { PublicApiRequest } from './public-api-key.guard';

interface WindowSpec {
  suffix: string;
  windowMs: number;
  limit: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly minuteLimit: number;
  private readonly dayLimit: number;

  constructor(
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.minuteLimit = Number(
      config.get<string>('RATE_LIMIT_PER_MIN') ?? process.env.RATE_LIMIT_PER_MIN ?? 60,
    );
    this.dayLimit = Number(
      config.get<string>('RATE_LIMIT_PER_DAY') ??
        process.env.RATE_LIMIT_PER_DAY ??
        1000,
    );
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<PublicApiRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const auth = req.publicAuth;
    if (!auth) return true; // guarded by upstream PublicApiKeyGuard

    const apiKeyId = auth.apiKey.id;
    const now = Date.now();

    // Per-user override beats env default. Useful for trusted/paying
    // customers who legitimately need higher throughput than the
    // conservative system-wide cap.
    const minuteLimit =
      typeof auth.user.rateLimitPerMin === 'number' && auth.user.rateLimitPerMin > 0
        ? auth.user.rateLimitPerMin
        : this.minuteLimit;
    const dayLimit =
      typeof auth.user.rateLimitPerDay === 'number' && auth.user.rateLimitPerDay > 0
        ? auth.user.rateLimitPerDay
        : this.dayLimit;

    const windows: WindowSpec[] = [
      { suffix: '1m', windowMs: 60_000, limit: minuteLimit },
      { suffix: '1d', windowMs: 86_400_000, limit: dayLimit },
    ];

    let tightest: { remaining: number; limit: number; resetMs: number } | null = null;

    for (const w of windows) {
      const key = `rl:${apiKeyId}:${w.suffix}`;
      const member = `${now}:${randomUUID()}`;
      try {
        const pipeline = this.redis.multi();
        pipeline.zadd(key, now, member);
        pipeline.zremrangebyscore(key, 0, now - w.windowMs);
        pipeline.zcard(key);
        pipeline.pexpire(key, w.windowMs);
        const result = await pipeline.exec();
        const card = Number(
          (result?.[2]?.[1] as number | string | null | undefined) ?? 0,
        );
        const remaining = Math.max(0, w.limit - card);
        const resetMs = now + w.windowMs;
        if (!tightest || remaining < tightest.remaining) {
          tightest = { remaining, limit: w.limit, resetMs };
        }
        if (card > w.limit) {
          // remove the entry we just added so retries within the window are fair
          await this.redis.zrem(key, member).catch(() => undefined);
          const retryAfter = Math.ceil(w.windowMs / 1000);
          res.setHeader('X-RateLimit-Limit', String(w.limit));
          res.setHeader('X-RateLimit-Remaining', '0');
          res.setHeader(
            'X-RateLimit-Reset',
            String(Math.floor((now + w.windowMs) / 1000)),
          );
          res.setHeader('Retry-After', String(retryAfter));
          throw new RateLimitExceededError(
            w.limit,
            Math.floor(w.windowMs / 1000),
            retryAfter,
          );
        }
      } catch (err) {
        if (err instanceof RateLimitExceededError) throw err;
        this.logger.warn(
          `rate-limit redis op failed for ${apiKeyId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (tightest) {
      res.setHeader('X-RateLimit-Limit', String(tightest.limit));
      res.setHeader('X-RateLimit-Remaining', String(tightest.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.floor(tightest.resetMs / 1000)));
    }
    return true;
  }
}
