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
import * as argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { AuthConfig } from '../../config/configuration';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

const tokenAlphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const generateToken = customAlphabet(tokenAlphabet, 48);

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_THROTTLE_MS = 60_000;

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

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name ?? null,
          locale: dto.locale ?? 'en',
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

    await this.issueAndSendVerification(user.email, user.name ?? user.email);
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
