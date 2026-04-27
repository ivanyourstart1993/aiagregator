import { Worker, type ConnectionOptions } from 'bullmq';
import {
  ApiRequestStatus,
  ReservationStatus,
  TaskStatus,
  TransactionType,
} from '@aiagg/db';
import type { PrismaClient } from '@aiagg/db';

const QUEUE = 'generation';
const STUB_ERROR_CODE = 'provider_not_implemented';
const STUB_ERROR_MESSAGE =
  'Provider adapter not implemented in Stage 6 (will be wired in Stages 7–9).';

interface JobData {
  taskId: string;
}

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const isTls = u.protocol === 'rediss:';
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    ...(isTls ? { tls: {} } : {}),
  };
}

export interface StubProcessorHandle {
  worker: Worker<JobData>;
  close: () => Promise<void>;
}

export function createStubGenerationWorker(opts: {
  redisUrl: string;
  prisma: PrismaClient;
}): StubProcessorHandle {
  const connection = parseRedisUrl(opts.redisUrl);
  const prisma = opts.prisma;

  const worker = new Worker<JobData>(
    QUEUE,
    async (job) => {
      const { taskId } = job.data;
      // Simulate provider work.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id: taskId },
          include: { apiRequest: true },
        });
        if (!task) {
          // task vanished — nothing to do
          return;
        }
        if (
          task.status === TaskStatus.SUCCEEDED ||
          task.status === TaskStatus.FAILED ||
          task.status === TaskStatus.CANCELLED
        ) {
          return;
        }

        // Mark task FAILED + apiRequest FINALIZED
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.FAILED,
            errorCode: STUB_ERROR_CODE,
            errorMessage: STUB_ERROR_MESSAGE,
            finishedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        await tx.apiRequest.update({
          where: { id: task.apiRequestId },
          data: {
            status: ApiRequestStatus.FINALIZED,
            errorCode: STUB_ERROR_CODE,
            errorMessage: STUB_ERROR_MESSAGE,
            finalizedAt: new Date(),
          },
        });

        // Release reservation associated with this task (if PENDING).
        const reservation = await tx.reservation.findFirst({
          where: { taskId, status: ReservationStatus.PENDING },
        });
        if (!reservation) return;

        // Idempotency guard: have we already released?
        const idemKey = `reservation:${reservation.id}:release`;
        const existing = await tx.idempotencyRecord.findUnique({
          where: { scope_key: { scope: 'reservation.release', key: idemKey } },
        });
        if (existing && existing.responseStatus !== 0) return;

        // Lock wallet via raw SQL — Prisma transactions on Postgres run in
        // the requested isolation level; default Read Committed is fine here
        // because we use optimistic version checking.
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
            `wallet version conflict during stub release (wallet=${wallet.id})`,
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
            type: TransactionType.RESERVATION_RELEASE,
            currency: reservation.currency,
            amountUnits: reservation.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: newReserved,
            reservationId: reservation.id,
            taskId: reservation.taskId,
            bundleKey: reservation.bundleKey,
            pricingSnapshotId: reservation.pricingSnapshotId,
            description: 'Reservation release (stub failure)',
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
            responseJson: { ok: true },
            responseStatus: 200,
          },
        });
      });
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[generation-worker] job ${job?.id ?? '?'} failed: ${err.message}`,
    );
  });

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}
