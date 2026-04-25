import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { Prisma } from '@aiagg/db';
import { IOREDIS_CLIENT } from '../../../common/redis/redis.module';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  IdempotencyKeyInUseError,
  IdempotencyKeyMismatchError,
} from '../../../common/errors/public-api.errors';
import type { PublicApiRequest } from '../guards/public-api-key.guard';

const IDEM_HEADER = 'idempotency-key';
const KEY_RE = /^[A-Za-z0-9_:-]{1,255}$/;
const SCOPE = 'public_api.generations';
const IN_PROGRESS_TTL_SEC = 30;
const DONE_TTL_SEC = 60 * 60 * 24; // 24h

interface DoneRecord {
  state: 'done';
  requestHash: string;
  responseStatus: number;
  responseJson: unknown;
}

interface InProgressRecord {
  state: 'in_progress';
  requestHash: string;
}

type Record_ = DoneRecord | InProgressRecord;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
}

function reviveBigInt(value: unknown): unknown {
  // The cached payload was serialised with bigint→string. We leave as-is —
  // global BigInt.prototype.toJSON keeps round-tripping consistent on the wire.
  return value;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<PublicApiRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const rawKey = req.header(IDEM_HEADER);
    if (!rawKey) return next.handle();

    if (!KEY_RE.test(rawKey)) {
      return throwError(() => new IdempotencyKeyInUseError(rawKey));
    }
    const auth = req.publicAuth;
    if (!auth) return next.handle();

    const apiKeyId = auth.apiKey.id;
    const redisKey = `idem:${apiKeyId}:generations:${rawKey}`;
    const requestHash = createHash('sha256')
      .update(canonicalize(req.body ?? {}))
      .digest('hex');

    return from(this.redis.get(redisKey)).pipe(
      switchMap((existing) => {
        if (existing) {
          let parsed: Record_;
          try {
            parsed = JSON.parse(existing) as Record_;
          } catch {
            return throwError(() => new IdempotencyKeyInUseError(rawKey));
          }
          if (parsed.state === 'in_progress') {
            return throwError(() => new IdempotencyKeyInUseError(rawKey));
          }
          if (parsed.state === 'done') {
            if (parsed.requestHash !== requestHash) {
              return throwError(() => new IdempotencyKeyMismatchError(rawKey));
            }
            res.setHeader('X-Idempotent-Replay', 'true');
            res.status(parsed.responseStatus || 200);
            return of(reviveBigInt(parsed.responseJson));
          }
        }

        const inProgress: InProgressRecord = {
          state: 'in_progress',
          requestHash,
        };
        return from(
          this.redis.set(
            redisKey,
            JSON.stringify(inProgress),
            'EX',
            IN_PROGRESS_TTL_SEC,
            'NX',
          ),
        ).pipe(
          switchMap((setRes) => {
            if (setRes !== 'OK') {
              return throwError(() => new IdempotencyKeyInUseError(rawKey));
            }
            return next.handle().pipe(
              tap(async (response) => {
                const status = res.statusCode || 200;
                const done: DoneRecord = {
                  state: 'done',
                  requestHash,
                  responseStatus: status,
                  responseJson: this.serialiseForCache(response),
                };
                try {
                  await this.redis.set(
                    redisKey,
                    JSON.stringify(done),
                    'EX',
                    DONE_TTL_SEC,
                  );
                } catch (err) {
                  this.logger.warn(
                    `idem cache write failed: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  );
                }
                // mirror to DB for durability (best-effort)
                try {
                  await this.prisma.idempotencyRecord.upsert({
                    where: { scope_key: { scope: SCOPE, key: rawKey } },
                    update: {
                      responseJson: done.responseJson as Prisma.InputJsonValue,
                      responseStatus: status,
                    },
                    create: {
                      scope: SCOPE,
                      key: rawKey,
                      responseJson: done.responseJson as Prisma.InputJsonValue,
                      responseStatus: status,
                    },
                  });
                } catch (err) {
                  this.logger.warn(
                    `idem db mirror failed: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  );
                }
              }),
              catchError((err: unknown) => {
                // 5xx (or any unhandled error) → release the lock so client can retry
                void this.redis.del(redisKey).catch(() => undefined);
                return throwError(() => err as Error);
              }),
            );
          }),
        );
      }),
    );
  }

  private serialiseForCache(value: unknown): unknown {
    return JSON.parse(
      JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  }
}
