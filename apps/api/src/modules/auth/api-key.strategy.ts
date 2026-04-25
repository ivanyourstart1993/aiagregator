import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import { ApiKeyStatus, UserStatus, type ApiKey, type User } from '@aiagg/db';
import { ErrorCode } from '@aiagg/shared';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthConfig } from '../../config/configuration';

const API_KEY_RE = /^sk_live_([A-Za-z0-9]{12})_([A-Za-z0-9]{24})$/;

// A precomputed argon2id hash used for timing-safe fake verification when prefix
// is not found. The actual plaintext below was hashed once and is never used.
// We compute it lazily on first use to avoid blocking module init.
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

export interface ApiKeyAuthContext {
  user: Pick<User, 'id' | 'email' | 'role' | 'status' | 'emailVerified'>;
  apiKey: Pick<ApiKey, 'id' | 'userId' | 'name' | 'prefix' | 'last4' | 'status' | 'lastUsedAt'>;
}

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(CustomStrategy, 'api-key') {
  private readonly logger = new Logger(ApiKeyStrategy.name);
  private readonly pepper: string;
  private readonly lastUsedDebounceMs = 5_000;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super();
    const auth = config.get<AuthConfig>('auth');
    if (!auth) throw new Error('auth config namespace missing');
    this.pepper = auth.apiKeyPepper;
  }

  async validate(req: Request): Promise<ApiKeyAuthContext> {
    const header = req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1]) throw this.invalid();

    const token = m[1].trim();
    const parts = API_KEY_RE.exec(token);
    if (!parts || !parts[1] || !parts[2]) throw this.invalid();

    const [, prefix, secret] = parts;
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { prefix },
      include: {
        user: {
          select: { id: true, email: true, role: true, status: true, emailVerified: true },
        },
      },
    });

    if (!apiKey) {
      // timing-safe fake verify
      try {
        await argon2.verify(await ensureDummyHash(), secret + this.pepper);
      } catch {
        // ignore — purely for timing
      }
      throw this.invalid();
    }

    if (apiKey.status !== ApiKeyStatus.ACTIVE) throw this.invalid();
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) throw this.invalid();
    if (apiKey.user.status !== UserStatus.ACTIVE) throw this.invalid();

    let ok = false;
    try {
      ok = await argon2.verify(apiKey.hashedSecret, secret + this.pepper);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`argon2 verify failed: ${msg}`);
      ok = false;
    }
    if (!ok) throw this.invalid();

    const now = Date.now();
    const stale =
      !apiKey.lastUsedAt || now - apiKey.lastUsedAt.getTime() > this.lastUsedDebounceMs;
    if (stale) {
      const ip = (req.ip ?? '').slice(0, 45) || null;
      void this.prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date(now), lastUsedIp: ip },
        })
        .catch((err: unknown) => {
          const m2 = err instanceof Error ? err.message : String(err);
          this.logger.warn(`failed to bump lastUsedAt: ${m2}`);
        });
    }

    return {
      user: apiKey.user,
      apiKey: {
        id: apiKey.id,
        userId: apiKey.userId,
        name: apiKey.name,
        prefix: apiKey.prefix,
        last4: apiKey.last4,
        status: apiKey.status,
        lastUsedAt: apiKey.lastUsedAt,
      },
    };
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCode.INVALID_API_KEY,
      message: 'Invalid or revoked API key.',
    });
  }
}
