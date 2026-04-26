// PollLroCron — drives long-running operations submitted by adapters that
// return `{ pending: true, providerJobId }` from `execute()`.
//
// Stage 8 introduces this for Google Veo (`operations/...` LROs from
// generativelanguage.googleapis.com:predictLongRunning). The same pattern
// is reused by Stage 9 (Kling) — adapters just need to implement
// `pollOperation(ctx, operationName)` on the ProviderAdapter interface.
//
// Flow per cron tick (every 15s):
//   1. Pick up to 50 oldest tasks with status=PROCESSING and providerJobId.
//   2. For each: load method + last ProviderAttempt → ProviderAccount creds.
//   3. Resolve adapter via AdapterRegistry; call pollOperation.
//   4. On `{ pending: true }`: skip — picked up next tick.
//   5. On `{ files }`: insert ResultFile rows, finalise Task + ApiRequest,
//      capture reservation. Mirrors the worker's succeed-path.
//   6. On AdapterError: fail task with mapped public code, release reservation.
//   7. Watchdog: if Task.startedAt is older than LRO_TIMEOUT_MS (default
//      10 min) AND we haven't been able to read a definitive answer, fail
//      with `external_task_timeout`.
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { CALLBACK_QUEUE } from '../bullmq/queue.constants';
import {
  ApiRequestStatus,
  ProxyStatus,
  ReservationStatus,
  ResultFileStatus,
  TaskStatus,
  TransactionType,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdapterRegistry } from './adapters/adapter-registry';
import { RateCardService } from '../rate-cards/rate-cards.service';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
} from './adapters/provider-adapter.interface';

const RESULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class PollLroCron {
  private readonly logger = new Logger(PollLroCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AdapterRegistry,
    private readonly rateCards: RateCardService,
    @InjectQueue(CALLBACK_QUEUE) private readonly callbackQueue: Queue,
  ) {}

  private async enqueueCallback(apiRequestId: string): Promise<void> {
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

  @Cron('*/15 * * * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return; // overlap guard for slow polls
    this.running = true;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.warn(
        `poll-lro tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<void> {
    const timeoutMs = Number(process.env.LRO_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: TaskStatus.PROCESSING,
        providerJobId: { not: null },
      },
      orderBy: { startedAt: 'asc' },
      take: 50,
      include: { apiRequest: true },
    });
    if (tasks.length === 0) return;

    for (const task of tasks) {
      try {
        await this.pollTask(task, timeoutMs);
      } catch (err) {
        this.logger.warn(
          `poll-lro: task ${task.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async pollTask(
    task: { id: string; userId: string; methodId: string; apiRequestId: string; providerJobId: string | null; startedAt: Date | null; apiRequest: { paramsRaw: unknown } },
    timeoutMs: number,
  ): Promise<void> {
    if (!task.providerJobId) return;
    const method = await this.prisma.method.findUnique({
      where: { id: task.methodId },
      include: { provider: true, model: true },
    });
    if (!method) {
      await this.failTask(task.id, {
        code: 'method_not_found',
        message: `Method ${task.methodId} not found`,
      });
      await this.enqueueCallback(task.apiRequestId);
      return;
    }
    const adapter = this.registry.find(
      method.provider.code,
      method.model.code,
      method.code,
    );
    if (!adapter || !adapter.pollOperation) {
      await this.failTask(task.id, {
        code: 'provider_not_implemented',
        message: `No polling adapter for ${method.provider.code}/${method.model.code}/${method.code}`,
      });
      await this.enqueueCallback(task.apiRequestId);
      return;
    }

    // Last attempt → account → credentials.
    const attempt = await this.prisma.providerAttempt.findFirst({
      where: { taskId: task.id },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!attempt || !attempt.providerAccountId) {
      await this.failTask(task.id, {
        code: 'no_provider_attempt',
        message: 'No provider attempt found for polling',
      });
      await this.enqueueCallback(task.apiRequestId);
      return;
    }
    const account = await this.prisma.providerAccount.findUnique({
      where: { id: attempt.providerAccountId },
    });
    if (!account) {
      await this.failTask(task.id, {
        code: 'no_available_provider_account',
        message: `Provider account ${attempt.providerAccountId} not found`,
      });
      await this.enqueueCallback(task.apiRequestId);
      return;
    }
    let proxyCtx: AdapterContext['proxy'] | undefined;
    if (account.proxyId) {
      const proxy = await this.prisma.proxy.findUnique({
        where: { id: account.proxyId },
      });
      if (proxy && proxy.status === ProxyStatus.ACTIVE) {
        proxyCtx = {
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          login: proxy.login ?? undefined,
          password: proxy.passwordHash ?? undefined,
        };
      }
    }

    const params = (task.apiRequest.paramsRaw ?? {}) as Record<string, unknown>;
    const ctx: AdapterContext = {
      taskId: task.id,
      apiRequestId: task.apiRequestId,
      userId: task.userId,
      provider: { id: method.providerId, code: method.provider.code },
      model: { id: method.modelId, code: method.model.code },
      method: { id: method.id, code: method.code },
      params,
      account: {
        id: account.id,
        credentials: (account.credentials ?? {}) as Record<string, unknown>,
      },
      proxy: proxyCtx,
    };

    try {
      const result = await adapter.pollOperation(ctx, task.providerJobId);
      if (result.pending) {
        // Watchdog: too long without resolution → fail.
        if (
          task.startedAt &&
          Date.now() - task.startedAt.getTime() > timeoutMs
        ) {
          await this.failTask(task.id, {
            code: 'external_task_timeout',
            message: `LRO ${task.providerJobId} exceeded ${timeoutMs}ms`,
          });
          await this.enqueueCallback(task.apiRequestId);
        }
        return;
      }
      const files = result.files ?? [];
      // Resolve provider cost from adapter result or rate card.
      let providerCostUnits: bigint | null = result.providerCostUnits ?? null;
      if (providerCostUnits == null) {
        const cost = await this.rateCards
          .getCost(method.providerId, method.modelId, method.id, {
            mode: (params.mode as string | undefined) ?? null,
            resolution: (params.resolution as string | undefined) ?? null,
            durationSeconds:
              (params.durationSeconds as number | undefined) ??
              (params.duration as number | undefined) ??
              null,
            aspectRatio: (params.aspectRatio as string | undefined) ?? null,
            imagesCount: (params.numberOfImages as number | undefined) ?? 1,
          })
          .catch(() => null);
        if (cost && cost.source === 'rate_card') {
          providerCostUnits = cost.providerCostUnits;
        }
      }
      await this.succeedTask({
        taskId: task.id,
        apiRequestId: task.apiRequestId,
        userId: task.userId,
        providerSlug: method.provider.code,
        modelSlug: method.model.code,
        methodCode: method.code,
        files,
        providerCostUnits,
      });
      await this.enqueueCallback(task.apiRequestId);
      await this.prisma.providerAttempt
        .update({
          where: { id: attempt.id },
          data: {
            status: 'success',
            finishedAt: new Date(),
            durationMs:
              Date.now() - (attempt.startedAt?.getTime() ?? Date.now()),
            providerCostUnits: providerCostUnits ?? undefined,
          },
        })
        .catch(() => undefined);
    } catch (err) {
      if (err instanceof AdapterError) {
        const publicCode = mapPublicCode(err.kind);
        await this.failTask(task.id, {
          code: publicCode,
          message: err.message,
        });
        await this.enqueueCallback(task.apiRequestId);
        await this.prisma.providerAttempt
          .update({
            where: { id: attempt.id },
            data: {
              status: 'failed',
              errorType: err.kind,
              errorCode: publicCode,
              errorMessage: err.message.slice(0, 4000),
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`poll-lro non-adapter error for ${task.id}: ${message}`);
        // Don't fail on transient/unknown — retry next tick. Watchdog catches stuck ones.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Capture / release / succeed / fail — duplicated from worker's
  // generation.processor.ts to avoid cross-app imports. Keep behaviour
  // identical so async-vs-sync flows produce the same DB state.
  // ---------------------------------------------------------------------------
  private async succeedTask(opts: {
    taskId: string;
    apiRequestId: string;
    userId: string;
    providerSlug: string;
    modelSlug: string;
    methodCode: string;
    files: AdapterFile[];
    providerCostUnits?: bigint | null;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + RESULT_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        opts.files.map((f) =>
          tx.resultFile.create({
            data: {
              taskId: opts.taskId,
              apiRequestId: opts.apiRequestId,
              userId: opts.userId,
              providerSlug: opts.providerSlug,
              modelSlug: opts.modelSlug,
              methodCode: opts.methodCode,
              fileUrl: f.url,
              storageBucket: f.bucket,
              storageKey: f.key,
              mimeType: f.mimeType,
              fileSize: BigInt(f.size),
              fileType: f.fileType,
              width: f.width ?? null,
              height: f.height ?? null,
              durationSeconds: f.durationSeconds ?? null,
              status: ResultFileStatus.AVAILABLE,
              expiresAt,
            },
          }),
        ),
      );
      const fileViews = created.map((c) => ({
        id: c.id,
        url: c.fileUrl,
        mimeType: c.mimeType,
        fileType: c.fileType,
        sizeBytes: c.fileSize.toString(),
        width: c.width,
        height: c.height,
        durationSeconds: c.durationSeconds?.toString() ?? null,
        expiresAt: c.expiresAt.toISOString(),
      }));
      await tx.task.update({
        where: { id: opts.taskId },
        data: {
          status: TaskStatus.SUCCEEDED,
          finishedAt: new Date(),
          attempts: { increment: 1 },
          resultData: { files: fileViews },
          resultFiles: fileViews,
        },
      });
      await tx.apiRequest.update({
        where: { id: opts.apiRequestId },
        data: {
          status: ApiRequestStatus.FINALIZED,
          finalizedAt: new Date(),
        },
      });
    });
    await this.captureReservation(opts.taskId, opts.providerCostUnits ?? null);
  }

  private async failTask(
    taskId: string,
    err: { code: string; message: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.findUnique({ where: { id: taskId } });
      if (!t) return;
      if (
        t.status === TaskStatus.SUCCEEDED ||
        t.status === TaskStatus.FAILED ||
        t.status === TaskStatus.CANCELLED
      ) {
        return;
      }
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          errorCode: err.code,
          errorMessage: err.message.slice(0, 1000),
          finishedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      await tx.apiRequest.update({
        where: { id: t.apiRequestId },
        data: {
          status: ApiRequestStatus.FINALIZED,
          errorCode: err.code,
          errorMessage: err.message.slice(0, 1000),
          finalizedAt: new Date(),
        },
      });
    });
    await this.releaseReservation(taskId, err.code);
  }

  private async captureReservation(
    taskId: string,
    providerCostUnits?: bigint | null,
  ): Promise<void> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { taskId, status: ReservationStatus.PENDING },
    });
    if (!reservation) return;
    const idemKey = `reservation:${reservation.id}:capture`;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { scope_key: { scope: 'reservation.capture', key: idemKey } },
      });
      if (existing && existing.responseStatus !== 0) return;
      const wallet = await tx.wallet.findUnique({
        where: { id: reservation.walletId },
      });
      if (!wallet) return;
      const captureUnits = reservation.amountUnits;
      const newReserved = wallet.reservedUnits - captureUnits;
      const newAvailable = wallet.availableUnits;
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
          `wallet version conflict during capture (wallet=${wallet.id})`,
        );
      }
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CAPTURED,
          capturedUnits: captureUnits,
          capturedAt: new Date(),
        },
      });
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          userId: reservation.userId,
          type: TransactionType.RESERVATION_CAPTURE,
          currency: reservation.currency,
          amountUnits: -captureUnits,
          balanceAfterUnits: newAvailable,
          reservedAfterUnits: newReserved,
          reservationId: reservation.id,
          taskId: reservation.taskId,
          bundleKey: reservation.bundleKey,
          pricingSnapshotId: reservation.pricingSnapshotId,
          description: 'Reservation capture',
          metadata:
            providerCostUnits != null
              ? { providerCostUnits: providerCostUnits.toString() }
              : undefined,
          idempotencyKey: idemKey,
          idempotencyScope: 'reservation.capture',
        },
      });
      await tx.idempotencyRecord.upsert({
        where: { scope_key: { scope: 'reservation.capture', key: idemKey } },
        update: { responseStatus: 200 },
        create: {
          scope: 'reservation.capture',
          key: idemKey,
          responseJson: { ok: true },
          responseStatus: 200,
        },
      });
    });
  }

  private async releaseReservation(
    taskId: string,
    note: string,
  ): Promise<void> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { taskId, status: ReservationStatus.PENDING },
    });
    if (!reservation) return;
    const idemKey = `reservation:${reservation.id}:release`;
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
          `wallet version conflict during release (wallet=${wallet.id})`,
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
  }
}

function mapPublicCode(kind: AdapterError['kind']): string {
  switch (kind) {
    case 'validation':
      return 'invalid_parameter';
    case 'content_rejected':
      return 'content_rejected';
    case 'rate_limit':
      return 'provider_rate_limited';
    case 'quota':
      return 'provider_quota_exhausted';
    case 'invalid_credentials':
      return 'provider_invalid_credentials';
    case 'billing':
      return 'provider_billing_error';
    case 'temporary':
      return 'provider_temporary_error';
    default:
      return 'provider_error';
  }
}
