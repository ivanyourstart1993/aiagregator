import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { ZodValidationPipe } from './dto/zod-pipe';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import { loginSchema, type LoginDto } from './dto/login.dto';
import {
  resendVerificationSchema,
  type ResendVerificationDto,
  verifyEmailSchema,
  type VerifyEmailDto,
} from './dto/verify-email.dto';
import { oauthBridgeSchema, type OauthBridgeDto } from './dto/oauth-bridge.dto';
import {
  forgotPasswordSchema,
  type ForgotPasswordDto,
  resetPasswordSchema,
  type ResetPasswordDto,
} from './dto/password-reset.dto';
import { AuthService } from './auth.service';

@Controller('internal/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Stricter rate limit on registration: a real human signs up once,
  // so 10 attempts / 5 minutes per source IP is more than enough and
  // shuts down the typical automated signup flood (we observed 5+ /sec
  // from a single IP via the BFF proxy). Note: under the BFF, the
  // throttler sees the web-server's IP, not the end-user's — that is
  // by design here, we want a hard ceiling on total signups too.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(verifyEmailSchema))
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(body.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(resendVerificationSchema))
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.auth.resendVerification(body.email);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @Public()
  @UseGuards(InternalServiceGuard)
  @Post('oauth-bridge')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(oauthBridgeSchema))
  oauthBridge(@Body() body: OauthBridgeDto) {
    return this.auth.oauthBridge(body);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body);
  }
}
