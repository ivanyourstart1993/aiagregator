import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from './dto/zod-pipe';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import { loginSchema, type LoginDto } from './dto/login.dto';
import {
  resendVerificationSchema,
  type ResendVerificationDto,
  verifyEmailSchema,
  type VerifyEmailDto,
} from './dto/verify-email.dto';
import { AuthService } from './auth.service';

@Controller('internal/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
}
