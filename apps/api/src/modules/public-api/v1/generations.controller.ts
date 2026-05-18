import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { GenerationsService } from '../services/generations.service';
import { TasksService } from '../services/tasks.service';
import { CreateGenerationDto } from '../dto/create-generation.dto';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import type { AdmitResultView, AuthContext, TaskView } from '../dto/views';

@Controller('v1/generations')
export class GenerationsController {
  constructor(
    private readonly service: GenerationsService,
    private readonly tasks: TasksService,
  ) {}

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

  // Alias for GET /v1/tasks/:id. POST /v1/generations returns task_id, and
  // clients reasonably (mis-)read that as "the resource lives at
  // /v1/generations/<task_id>". Returning 404 there teaches the wrong lesson;
  // forwarding to TasksService.get keeps both surfaces working with one
  // canonical implementation.
  @Get(':id')
  @PublicApi()
  async get(
    @CurrentApiCaller() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<{ success: true; task: TaskView }> {
    const task = await this.tasks.get(id, auth.user.id);
    return { success: true, task };
  }
}
