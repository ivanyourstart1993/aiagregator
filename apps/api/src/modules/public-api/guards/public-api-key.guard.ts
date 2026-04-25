import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyStatus, UserStatus } from '@aiagg/db';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IOREDIS_CLIENT } from '../../../common/redis/redis.module';
import {
  InvalidApiKeyError,
  UserBlockedError,
} from '../../../common/errors/public-api.errors';
import type { AuthConfig } from '../../../config/configuration';
import type { AuthContext } from '../dto/views';

const API_KEY_RE = /^sk_live_([A-Za-z0-9]{12})_([A-Za-z0-9]{24})$/;

interface CachedApiKey {
  apiKeyId: string;
  userId: string;
  hashedSecret: string;
  status: ApiKeyStatus;
  userStatus: UserStatus;
  email: string;
  role: string;
  emailVerifiedTs: number | null;
  expiresAtTs: number | null;
}

let dummyHash: string | null = null;
async function ensureDummyHash(): Promise<string> {
  if (dummyHash) return dummyHash;
  dummyHash = await argon2.hash('dummy-secret-for-timing-safety', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  return dummyHash;
}

export interface PublicApiRequest extends Request {
  publicAuth?: AuthContext;
}

@Injectable()
export class PublicApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(PublicApiKeyGuard.name);
  private readonly pepper: string;
  private readonly cacheTtlSec = 60;
  private readonly touchDebounceSec = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    const auth = config.get<AuthConfig>('auth');
    if (!auth) throw new Error('auth config namespace missing');
    this.pepper = auth.apiKeyPepper;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<PublicApiRequest>();
    const header = req.header?.('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1]) throw new InvalidApiKeyError('missing_bearer');

    const token = m[1].trim();
    const parts = API_KEY_RE.exec(token);
    if (!parts || !parts[1] || !parts[2]) throw new InvalidApiKeyError('bad_format');

    const [, prefix, secret] = parts;

    let cached: CachedApiKey | null = null;
    try {
      const raw = await this.redis.get(`apikey:${prefix}`);
      if (raw) cached = JSON.parse(raw) as CachedApiKey;
    } catch (err) {
      this.logger.warn(
        `redis cache read failed for apikey:${prefix}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!cached) {
      cached = await this.loadAndCache(prefix);
    }

    if (!cached) {
      // timing-safe fake verify
      try {
        await argon2.verify(await ensureDummyHash(), secret + this.pepper);
      } catch {
        // ignore
      }
      throw new InvalidApiKeyError('not_found');
    }

    if (cached.status !== ApiKeyStatus.ACTIVE) throw new InvalidApiKeyError('inactive');
    if (cached.expiresAtTs && cached.expiresAtTs < Date.now()) {
      throw new InvalidApiKeyError('expired');
    }
    if (cached.userStatus !== UserStatus.ACTIVE) {
      throw new UserBlockedError(cached.userId);
    }

    let ok = false;
    try {
      ok = await argon2.verify(cached.hashedSecret, secret + this.pepper);
    } catch (err) {
      this.logger.warn(
        `argon2 verify failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!ok) throw new InvalidApiKeyError('mismatch');

    const auth: AuthContext = {
      user: {
        id: cached.userId,
        email: cached.email,
        role: cached.role,
        status: cached.userStatus,
        emailVerified: cached.emailVerifiedTs ? new Date(cached.emailVerifiedTs) : null,
      },
      apiKey: {
        id: cached.apiKeyId,
        userId: cached.userId,
        prefix,
      },
    };
    req.publicAuth = auth;
    // Bridge to req.user so other Nest helpers (e.g. CurrentUser) keep working.
    (req as unknown as { user?: unknown }).user = auth.user;

    void this.touchLastUsed(cached.apiKeyId, prefix, req.ip ?? null);

    return true;
  }

  private async loadAndCache(prefix: string): Promise<CachedApiKey | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { prefix },
      include: {
        user: {
          select: { id: true, email: true, role: true, status: true, emailVerified: true },
        },
      },
    });
    if (!apiKey) return null;
    const cached: CachedApiKey = {
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      hashedSecret: apiKey.hashedSecret,
      status: apiKey.status,
      userStatus: apiKey.user.status,
      email: apiKey.user.email,
      role: apiKey.user.role,
      emailVerifiedTs: apiKey.user.emailVerified
        ? apiKey.user.emailVerified.getTime()
        : null,
      expiresAtTs: apiKey.expiresAt ? apiKey.expiresAt.getTime() : null,
    };
    try {
      await this.redis.set(
        `apikey:${prefix}`,
        JSON.stringify(cached),
        'EX',
        this.cacheTtlSec,
      );
    } catch (err) {
      this.logger.warn(
        `redis cache write failed for apikey:${prefix}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return cached;
  }

  private async touchLastUsed(
    apiKeyId: string,
    prefix: string,
    ip: string | null,
  ): Promise<void> {
    const lockKey = `apikey-touch:${apiKeyId}`;
    try {
      const set = await this.redis.set(lockKey, '1', 'EX', this.touchDebounceSec, 'NX');
      if (set !== 'OK') return;
    } catch (err) {
      this.logger.warn(
        `touch lock failed for ${apiKeyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    try {
      await this.prisma.apiKey.update({
        where: { id: apiKeyId },
        data: {
          lastUsedAt: new Date(),
          lastUsedIp: ip ? ip.slice(0, 45) : null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `failed to bump lastUsedAt for ${prefix}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
