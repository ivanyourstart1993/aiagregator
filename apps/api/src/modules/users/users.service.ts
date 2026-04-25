import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@aiagg/shared';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthConfig } from '../../config/configuration';

export interface UpdateMeInput {
  name?: string;
  locale?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class UsersService {
  private readonly auth: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const auth = config.get<AuthConfig>('auth');
    if (!auth) throw new Error('auth config namespace missing');
    this.auth = auth;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        locale: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        locale: true,
        role: true,
        status: true,
        emailVerified: true,
      },
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Password change is not available for this account.',
      });
    }
    let ok = false;
    try {
      ok = await argon2.verify(user.passwordHash, input.currentPassword + this.auth.apiKeyPepper);
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Current password is incorrect.',
      });
    }
    const newHash = await argon2.hash(input.newPassword + this.auth.apiKeyPepper, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
    return { ok: true };
  }
}
