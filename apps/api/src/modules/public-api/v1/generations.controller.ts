import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Ip,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { GenerationsService } from '../services/generations.service';
import { CreateGenerationDto } from '../dto/create-generation.dto';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import type { AdmitResultView, AuthContext } from '../dto/views';

@Controller('v1/generations')
export class GenerationsController {
  constructor(private readonly service: GenerationsService) {}

  @Post()
  @HttpCode(202)
  @PublicApi()
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentApiCaller() auth: AuthContext,
    @Body() body: CreateGenerationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ): Promise<AdmitResultView> {
    void req;
    return this.service.admit({
      auth,
      body,
      idempotencyKey: idempotencyKey ?? undefined,
      ip: ip ?? undefined,
      ua: userAgent ?? undefined,
    });
  }
}
