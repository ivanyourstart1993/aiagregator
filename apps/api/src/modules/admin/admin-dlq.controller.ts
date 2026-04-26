// Admin: inspect / retry / drop dead-letter jobs.
// Stage 10. Routes:
//   GET    /internal/admin/dlq/generation
//   GET    /internal/admin/dlq/callback
//   POST   /internal/admin/dlq/:queue/:jobId/retry
//   DELETE /internal/admin/dlq/:queue/:jobId
import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { UserRole } from '@aiagg/db';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CALLBACK_DLQ,
  CALLBACK_QUEUE,
  GENERATION_DLQ,
  GENERATION_QUEUE,
} from '../bullmq/queue.constants';

type QueueKey = 'generation' | 'callback';

@Controller('internal/admin/dlq')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDlqController {
  constructor(
    @InjectQueue(GENERATION_DLQ) private readonly genDlq: Queue,
    @InjectQueue(CALLBACK_DLQ) private readonly cbDlq: Queue,
    @InjectQueue(GENERATION_QUEUE) private readonly genQueue: Queue,
    @InjectQueue(CALLBACK_QUEUE) private readonly cbQueue: Queue,
  ) {}

  private dlqFor(name: string): Queue {
    if (name === 'generation') return this.genDlq;
    if (name === 'callback') return this.cbDlq;
    throw new BadRequestException(`unknown dlq: ${name}`);
  }

  private mainFor(name: string): Queue {
    if (name === 'generation') return this.genQueue;
    if (name === 'callback') return this.cbQueue;
    throw new BadRequestException(`unknown queue: ${name}`);
  }

  @Get('generation')
  async listGeneration(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ): Promise<unknown> {
    return this.list('generation', page, pageSize);
  }

  @Get('callback')
  async listCallback(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ): Promise<unknown> {
    return this.list('callback', page, pageSize);
  }

  private async list(
    name: QueueKey,
    page: number,
    pageSize: number,
  ): Promise<unknown> {
    const size = Math.min(Math.max(pageSize, 1), 200);
    const start = (Math.max(page, 1) - 1) * size;
    const end = start + size - 1;
    const dlq = this.dlqFor(name);
    const [waiting, completed, failed] = await Promise.all([
      dlq.getJobs(['waiting'], start, end, false),
      dlq.getJobs(['completed'], start, end, false),
      dlq.getJobs(['failed'], start, end, false),
    ]);
    const merged = [...waiting, ...completed, ...failed];
    const items = merged.map((j) => ({
      id: j.id,
      name: j.name,
      data: j.data as unknown,
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason,
      timestamp: j.timestamp,
      processedOn: j.processedOn ?? null,
      finishedOn: j.finishedOn ?? null,
    }));
    return { items, page, pageSize: size, queue: `${name}-dead-letter` };
  }

  @Post(':queue/:jobId/retry')
  async retry(
    @Param('queue') queueName: string,
    @Param('jobId') jobId: string,
  ): Promise<{ ok: true; movedTo: string }> {
    const dlq = this.dlqFor(queueName);
    const job = await dlq.getJob(jobId);
    if (!job) throw new NotFoundException(`job ${jobId} not in ${queueName}-dead-letter`);
    const main = this.mainFor(queueName);
    await main.add(`retry-from-dlq:${jobId}`, job.data, {
      attempts: queueName === 'generation' ? 3 : 5,
      backoff: {
        type: 'exponential',
        delay: queueName === 'generation' ? 5000 : 2000,
      },
      removeOnComplete: queueName === 'generation' ? 100 : { age: 3600, count: 1000 },
      removeOnFail: queueName === 'generation' ? 1000 : { age: 86400, count: 5000 },
    });
    await job.remove().catch(() => undefined);
    return { ok: true, movedTo: queueName };
  }

  @Delete(':queue/:jobId')
  async drop(
    @Param('queue') queueName: string,
    @Param('jobId') jobId: string,
  ): Promise<{ ok: true }> {
    const dlq = this.dlqFor(queueName);
    const job = await dlq.getJob(jobId);
    if (!job) throw new NotFoundException(`job ${jobId} not in ${queueName}-dead-letter`);
    await job.remove();
    return { ok: true };
  }
}
