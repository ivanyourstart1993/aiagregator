import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiRequestStatus, ReservationStatus, TaskStatus } from '@aiagg/db';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CALLBACK_QUEUE,
  GENERATION_QUEUE,
} from '../../bullmq/queue.constants';

@Injectable()
export class TaskSweeperCron {
  private readonly logger = new Logger(TaskSweeperCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue,
    @InjectQueue(CALLBACK_QUEUE) private readonly callbackQueue: Queue,
  ) {}

  private async enqueueCallback(apiRequestId: string): Promise<void> {
    if (!apiRequestId) return;
    try {
      await this.callbackQueue.add(
        'dispatch',
        { apiRequestId },
        {
          attempts: Number(process.env.CALLBACK_MAX_ATTEMPTS ?? 5),
          backoff: {
            type: 'exponential',
            delay: Number(process.env.CALLBACK_BACKOFF_MS ?? 2000),
          },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400, count: 5000 },
        },
      );
    } catch (err) {
      this.logger.warn(
        `failed to enqueue callback for ${apiRequestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async releaseReservation(taskId: string, note: string): Promise<void> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { taskId, status: ReservationStatus.PENDING },
    });
    if (!reservation) return;
    const idemKey = `reservation:${reservation.id}:release`;
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({
          where: { scope_key: { scope: 'reservation.release', key: idemKey } },
        });
        if (existing && existing.responseStatus !== 0) return;
        const wallet = await tx.wallet.findUnique({
          where: { id: reservation.walletId },
        });
        if (!wallet) return;
        const newReserved = wallet.reservedUnits - reservation.amountUnits;
        const newAvailable = wallet.availableUnits + reservation.amountUnits;
        const updated = await tx.wallet.updateMany({
          where: { id: wallet.id, version: wallet.version },
          data: {
            reservedUnits: newReserved,
            availableUnits: newAvailable,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error(
            `wallet version conflict during sweeper release (wallet=${wallet.id})`,
          );
        }
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: ReservationStatus.RELEASED, releasedAt: new Date() },
        });
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId: reservation.userId,
            type: 'RESERVATION_RELEASE',
            currency: reservation.currency,
            amountUnits: reservation.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: newReserved,
            reservationId: reservation.id,
            taskId: reservation.taskId,
            bundleKey: reservation.bundleKey,
            pricingSnapshotId: reservation.pricingSnapshotId,
            description: `Reservation release (${note})`,
            idempotencyKey: idemKey,
            idempotencyScope: 'reservation.release',
          },
        });
        await tx.idempotencyRecord.upsert({
          where: { scope_key: { scope: 'reservation.release', key: idemKey } },
          update: { responseStatus: 200 },
          create: {
            scope: 'reservation.release',
            key: idemKey,
            responseJson: { ok: true, note },
            responseStatus: 200,
          },
        });
      });
    } catch (err) {
      this.logger.warn(
        `release reservation failed for task=${taskId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

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
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 1000,
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

    // Stuck PROCESSING tasks: started >1h ago without finalisation. Fail
    // them with `task_timed_out`, release any held reservation, and notify
    // the client via callback.
    const procCutoff = new Date(Date.now() - 60 * 60 * 1000);
    const stuck = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.PROCESSING,
        startedAt: { lt: procCutoff },
      },
      orderBy: { startedAt: 'asc' },
      take: 50,
      select: { id: true, apiRequestId: true },
    });
    for (const t of stuck) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const cur = await tx.task.findUnique({ where: { id: t.id } });
          if (!cur || cur.status !== TaskStatus.PROCESSING) return;
          await tx.task.update({
            where: { id: t.id },
            data: {
              status: TaskStatus.FAILED,
              errorCode: 'task_timed_out',
              errorMessage: 'Task exceeded processing watchdog (>1h)',
              finishedAt: new Date(),
            },
          });
          await tx.apiRequest.update({
            where: { id: t.apiRequestId },
            data: {
              status: ApiRequestStatus.FINALIZED,
              errorCode: 'task_timed_out',
              errorMessage: 'Task exceeded processing watchdog (>1h)',
              finalizedAt: new Date(),
            },
          });
        });
        await this.releaseReservation(t.id, 'task_timed_out');
        await this.enqueueCallback(t.apiRequestId);
      } catch (err) {
        this.logger.warn(
          `sweeper failed to fail stuck task ${t.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
