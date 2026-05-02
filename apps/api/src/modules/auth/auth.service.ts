import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserStatus, VerificationTokenType, type User } from '@aiagg/db';
import { ErrorCode } from '@aiagg/shared';
import { verifyGoogleIdToken } from '@aiagg/shared';
import * as argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { AuthConfig } from '../../config/configuration';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { OauthBridgeDto } from './dto/oauth-bridge.dto';
import type { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';

const tokenAlphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const generateToken = customAlphabet(tokenAlphabet, 48);

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_THROTTLE_MS = 60_000;

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const PASSWORD_RESET_TTL_HOURS = 1;
const PASSWORD_RESET_THROTTLE_MS = 60_000;

export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  role: User['role'];
  status: User['status'];
  emailVerified: Date | null;
}

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly auth: AuthConfig;
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
  ) {
    const auth = this.config.get<AuthConfig>('auth');
    if (!auth) throw new Error('auth config namespace missing');
    this.auth = auth;
    this.webUrl = this.config.get<string>('webUrl') ?? 'http://localhost:3000';
  }

  async register(dto: RegisterDto): Promise<{ user: SafeUser }> {
    const email = dto.email.toLowerCase().trim();
    const passwordHash = await argon2.hash(dto.password + this.auth.apiKeyPepper, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const autoVerify = process.env.EMAIL_AUTO_VERIFY === 'true';

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name ?? null,
          locale: dto.locale ?? 'en',
          emailVerified: autoVerify ? new Date() : null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.INVALID_REQUEST,
          message: 'Email already registered.',
        });
      }
      throw err;
    }

    if (!autoVerify) {
      await this.issueAndSendVerification(user.email, user.name ?? user.email);
    }
    return { user: toSafeUser(user) };
  }

  async resendVerification(email: string): Promise<{ ok: true }> {
    const normalised = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalised } });
    // Always return success to avoid leaking which emails exist; only send when user exists & unverified.
    if (!user || user.emailVerified) {
      return { ok: true };
    }

    // Throttle: refuse if a token was issued in the last RESEND_THROTTLE_MS.
    const recent = await this.prisma.verificationToken.findFirst({
      where: {
        identifier: normalised,
        type: VerificationTokenType.EMAIL_VERIFY,
        expires: { gt: new Date(Date.now() + VERIFY_TTL_MS - RESEND_THROTTLE_MS) },
      },
    });
    if (recent) {
      throw new BadRequestException({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Verification email was sent recently. Please wait a minute before retrying.',
      });
    }

    await this.issueAndSendVerification(user.email, user.name ?? user.email);
    return { ok: true };
  }

  async verifyEmail(token: string): Promise<{ user: SafeUser }> {
    const record = await this.prisma.verificationToken.findUnique({ where: { token } });
    if (!record || record.type !== VerificationTokenType.EMAIL_VERIFY) {
      throw new NotFoundException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Verification token not found.',
      });
    }
    if (record.expires.getTime() < Date.now()) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Verification token has expired.',
      });
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { email: record.identifier },
        data: { emailVerified: new Date() },
      });
      await tx.verificationToken.delete({ where: { token } });
      return updated;
    });

    return { user: toSafeUser(user) };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; accessToken: string }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const fakeHash = await argon2.hash('dummy-password-for-timing', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const stored = user?.passwordHash ?? fakeHash;
    let ok = false;
    try {
      ok = await argon2.verify(stored, dto.password + this.auth.apiKeyPepper);
    } catch {
      ok = false;
    }
    if (!user || !ok) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Invalid email or password.',
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: ErrorCode.USER_BLOCKED,
        message: 'Account is not active.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      emailVerified: user.emailVerified ? Math.floor(user.emailVerified.getTime() / 1000) : null,
    });

    return { user: toSafeUser(user), accessToken };
  }

  /**
   * Bridge an OAuth sign-in (currently Google) into a local User row.
   *
   * Verifies the Google `id_token` server-side (signature + claims) and
   * derives identity strictly from the verified payload. Refuses if
   * `email_verified !== true` so a hijacked Google account with
   * unverified email cannot pre-claim an arbitrary address.
   *
   * Look up existing Account by (provider, sub) — if found, return its user.
   * Otherwise look up User by the verified email and link the OAuth Account
   * to it; if no User exists, create one (already email-verified since the
   * IdP attests to ownership).
   *
   * Idempotent: repeated calls with the same id_token return the same user.
   */
  async oauthBridge(dto: OauthBridgeDto): Promise<{ user: SafeUser }> {
    const expectedAud = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    if (!expectedAud) {
      this.logger.error('oauth-bridge: neither GOOGLE_OAUTH_CLIENT_ID nor GOOGLE_CLIENT_ID is set');
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'OAuth is not configured.',
      });
    }

    let payload;
    try {
      payload = await verifyGoogleIdToken(dto.idToken, { audience: expectedAud });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`oauth-bridge: id_token verification failed: ${msg}`);
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Invalid Google id_token.',
      });
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Google email is not verified.',
      });
    }

    const email = payload.email.toLowerCase().trim();
    const providerAccountId = payload.sub;
    const name = payload.name ?? null;

    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: dto.provider,
          providerAccountId,
        },
      },
      include: { user: true },
    });
    if (existingAccount) {
      if (existingAccount.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException({
          code: ErrorCode.USER_BLOCKED,
          message: 'Account is not active.',
        });
      }
      await this.prisma.user.update({
        where: { id: existingAccount.user.id },
        data: { lastLoginAt: new Date() },
      });
      return { user: toSafeUser(existingAccount.user) };
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (existingUser.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException({
          code: ErrorCode.USER_BLOCKED,
          message: 'Account is not active.',
        });
      }
      // Refuse to silently link if the existing user already has a different
      // Google account attached — this would be a takeover vector if a
      // first-link attempt could overwrite the original. (createMany unique
      // constraint blocks this anyway, but we want a clear error.)
      const otherGoogle = await this.prisma.account.findFirst({
        where: { userId: existingUser.id, provider: dto.provider },
        select: { providerAccountId: true },
      });
      if (otherGoogle && otherGoogle.providerAccountId !== providerAccountId) {
        throw new UnauthorizedException({
          code: ErrorCode.INVALID_REQUEST,
          message: 'Another Google account is already linked to this user.',
        });
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.account.create({
          data: {
            userId: existingUser.id,
            type: 'oauth',
            provider: dto.provider,
            providerAccountId,
          },
        });
        return tx.user.update({
          where: { id: existingUser.id },
          data: {
            lastLoginAt: new Date(),
            // The IdP verified the email — promote to verified for legacy
            // password-only signups that never confirmed.
            emailVerified: existingUser.emailVerified ?? new Date(),
            // Backfill display name from Google profile if missing.
            name: existingUser.name ?? name,
          },
        });
      });
      return { user: toSafeUser(updated) };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          locale: 'en',
          emailVerified: new Date(),
          lastLoginAt: new Date(),
        },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider: dto.provider,
          providerAccountId,
        },
      });
      return user;
    });
    return { user: toSafeUser(created) };
  }

  /**
   * Request a password reset link. Always returns `{ ok: true }` — even if the
   * email doesn't exist — to avoid leaking which addresses are registered.
   * If a token was issued in the last minute, refuses to send another (throttle).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { ok: true };
    }

    // Throttle: refuse if a still-valid token was issued in the last
    // PASSWORD_RESET_THROTTLE_MS. Encoded by checking
    // `expires > now + TTL - THROTTLE`: a freshly-minted token's `expires`
    // is `now + TTL`, so the inequality holds for `THROTTLE` ms after issue.
    // After that window the user may legitimately request another reset.
    const recent = await this.prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        type: VerificationTokenType.PASSWORD_RESET,
        expires: {
          gt: new Date(Date.now() + PASSWORD_RESET_TTL_MS - PASSWORD_RESET_THROTTLE_MS),
        },
      },
    });
    if (recent) {
      // Silently swallow throttle for the user-facing endpoint to avoid
      // leaking timing info; one minute later they can retry.
      return { ok: true };
    }

    const token = generateToken();
    const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.prisma.verificationToken.deleteMany({
      where: { identifier: email, type: VerificationTokenType.PASSWORD_RESET },
    });
    await this.prisma.verificationToken.create({
      data: { identifier: email, token, expires, type: VerificationTokenType.PASSWORD_RESET },
    });

    const resetUrl = `${this.webUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.sendPasswordResetEmail(
        user.email,
        user.name ?? user.email,
        resetUrl,
        PASSWORD_RESET_TTL_HOURS,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send password reset email to ${email}: ${msg}`);
      // Do not leak send failure — token is valid until expiry; user can retry.
    }

    return { ok: true };
  }

  /**
   * Consume a password reset token: hash the new password, update the user,
   * delete the token. Throws on invalid / expired token.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ user: SafeUser }> {
    const record = await this.prisma.verificationToken.findUnique({ where: { token: dto.token } });
    if (!record || record.type !== VerificationTokenType.PASSWORD_RESET) {
      throw new NotFoundException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Reset token not found.',
      });
    }
    if (record.expires.getTime() < Date.now()) {
      // Clean up expired token opportunistically.
      await this.prisma.verificationToken.delete({ where: { token: dto.token } }).catch(() => {});
      throw new BadRequestException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Reset token has expired.',
      });
    }

    const passwordHash = await argon2.hash(dto.password + this.auth.apiKeyPepper, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { email: record.identifier },
        data: {
          passwordHash,
          // A successful reset implies email ownership; mirror verify-email semantics.
          emailVerified: new Date(),
        },
      });
      // Invalidate this and any other outstanding reset tokens for this email.
      await tx.verificationToken.deleteMany({
        where: { identifier: record.identifier, type: VerificationTokenType.PASSWORD_RESET },
      });
      return updated;
    });

    return { user: toSafeUser(user) };
  }

  private async issueAndSendVerification(email: string, displayName: string): Promise<void> {
    const token = generateToken();
    const expires = new Date(Date.now() + VERIFY_TTL_MS);
    await this.prisma.verificationToken.deleteMany({
      where: { identifier: email, type: VerificationTokenType.EMAIL_VERIFY },
    });
    await this.prisma.verificationToken.create({
      data: { identifier: email, token, expires, type: VerificationTokenType.EMAIL_VERIFY },
    });

    const verifyUrl = `${this.webUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.sendVerificationEmail(email, displayName, verifyUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send verification email to ${email}: ${msg}`);
      // Do not leak send failure to caller — token remains valid.
    }
  }
}
