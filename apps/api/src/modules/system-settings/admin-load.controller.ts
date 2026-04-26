// Admin load monitoring — Stage 14.
//   GET /internal/admin/load/queues  — BullMQ getJobCounts for all queues
//   GET /internal/admin/load/redis   — selected ioredis INFO stats
//   GET /internal/admin/load/db      — task / api_request status histograms
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ApiRequestStatus,
  TaskStatus,
  UserRole,
} from '@aiagg/db';
import type { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IOREDIS_CLIENT } from '../../common/redis/redis.module';
import {
  CALLBACK_DLQ,
  CALLBACK_QUEUE,
  GENERATION_DLQ,
  GENERATION_QUEUE,
} from '../bullmq/queue.constants';

const QUEUE_STATES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
] as const;

@Controller('internal/admin/load')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminLoadController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(GENERATION_QUEUE) private readonly genQueue: Queue,
    @InjectQueue(CALLBACK_QUEUE) private readonly cbQueue: Queue,
    @InjectQueue(GENERATION_DLQ) private readonly genDlq: Queue,
    @InjectQueue(CALLBACK_DLQ) private readonly cbDlq: Queue,
  ) {}

  @Get('queues')
  async queues(): Promise<unknown> {
    const [generation, callback, generationDlq, callbackDlq] =
      await Promise.all([
        this.genQueue.getJobCounts(...QUEUE_STATES),
        this.cbQueue.getJobCounts(...QUEUE_STATES),
        this.genDlq.getJobCounts(...QUEUE_STATES),
        this.cbDlq.getJobCounts(...QUEUE_STATES),
      ]);
    return {
      generation,
      callback,
      generationDlq,
      callbackDlq,
    };
  }

  @Get('redis')
  async redisInfo(): Promise<unknown> {
    let info = '';
    try {
      info = (await this.redis.info()) ?? '';
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const stats: Record<string, string> = {};
    for (const line of info.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1);
      stats[key] = value;
    }
    const pick = (k: string): string | undefined =>
      stats[k] !== undefined ? stats[k] : undefined;
    return {
      ok: true,
      uptimeSeconds: pick('uptime_in_seconds'),
      connectedClients: pick('connected_clients'),
      usedMemory: pick('used_memory'),
      usedMemoryHuman: pick('used_memory_human'),
      memFragmentationRatio: pick('mem_fragmentation_ratio'),
      totalCommandsProcessed: pick('total_commands_processed'),
      keyspaceHits: pick('keyspace_hits'),
      keyspaceMisses: pick('keyspace_misses'),
      role: pick('role'),
    };
  }

  @Get('db')
  async db(): Promise<unknown> {
    const [taskGroup, requestGroup, taskTotal, requestTotal] =
      await Promise.all([
        this.prisma.task.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.apiRequest.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.task.count(),
        this.prisma.apiRequest.count(),
      ]);
    const tasks: Record<string, number> = {};
    for (const v of Object.values(TaskStatus)) tasks[v] = 0;
    for (const row of taskGroup) tasks[row.status] = row._count._all;
    const requests: Record<string, number> = {};
    for (const v of Object.values(ApiRequestStatus)) requests[v] = 0;
    for (const row of requestGroup) requests[row.status] = row._count._all;
    return {
      tasks: { total: taskTotal, byStatus: tasks },
      apiRequests: { total: requestTotal, byStatus: requests },
    };
  }
}
