import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyStrategy } from './api-key.strategy';
import type { AuthConfig } from '../../config/configuration';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.get<AuthConfig>('auth');
        if (!auth) throw new Error('auth config namespace missing');
        return {
          secret: auth.jwtSecret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: auth.jwtAccessTtl,
            issuer: auth.jwtIssuer,
            audience: auth.jwtAudience,
          },
        };
      },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ApiKeyStrategy],
  exports: [AuthService, JwtStrategy, ApiKeyStrategy],
})
export class AuthModule {}
