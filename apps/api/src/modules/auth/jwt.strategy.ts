import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus, type UserRole } from '@aiagg/db';
import { ExtractJwt, Strategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import type { AuthConfig } from '../../config/configuration';

interface JwtPayload {
  sub: string;
  role: UserRole;
  emailVerified: number | null; // unix seconds or null
  iss?: string;
  aud?: string | string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const auth = config.get<AuthConfig>('auth');
    if (!auth) {
      throw new Error('auth config namespace missing');
    }
    const opts: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: auth.jwtSecret,
      issuer: auth.jwtIssuer,
      audience: auth.jwtAudience,
      algorithms: ['HS256'],
    };
    super(opts);
  }

  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, emailVerified: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not active');
    }
    return user;
  }
}
