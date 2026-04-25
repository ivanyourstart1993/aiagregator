import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TaskStatus } from '@aiagg/db';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GENERATION_QUEUE } from '../../bullmq/queue.constants';

@Injectable()
export class TaskSweeperCron {
  private readonly logger = new Logger(TaskSweeperCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Re-enqueue tasks stuck in PENDING for >30s with no Bull job.
   * Runs every 30 seconds. Cheap O(few) scan; scales by status index.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    const cutoff = new Date(Date.now() - 30_000);
    const stale = await this.prisma.task.findMany({
      where: { status: TaskStatus.PENDING, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true },
    });
    for (const t of stale) {
      const jobId = `task:${t.id}`;
      try {
        const existing = await this.queue.getJob(jobId);
        if (existing) continue;
        await this.queue.add(
          'generate',
          { taskId: t.id },
          {
            jobId,
            attempts: 1,
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 86400, count: 1000 },
          },
        );
      } catch (err) {
        this.logger.warn(
          `sweeper failed to re-enqueue ${t.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
