// Real provider-dispatching generation worker (Stage 7).
// Replaces stub-generation.processor.ts. Uses the worker-local adapter
// registry to call Google Banana; falls back to provider_not_implemented
// for providers without an adapter (Veo / Kling — Stages 8+9).
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import {
  ApiRequestStatus,
  ProviderAccountStatus,
  ProxyStatus,
  ReservationStatus,
  ResultFileStatus,
  TaskStatus,
  TransactionType,
} from '@aiagg/db';
import type { PrismaClient } from '@aiagg/db';
import type { WorkerAdapterRegistry } from '../adapters/registry';
import {
  AdapterError,
  type AdapterContext,
  type AdapterFile,
} from '../adapters/types';
import type { WorkerStorage } from '../storage/storage';

const QUEUE = 'generation';
const CALLBACK_QUEUE = 'callback';
const DLQ = 'generation-dead-letter';
const NOT_IMPLEMENTED = 'provider_not_implemented';
const RESULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ATTEMPTS = 3;

interface JobData {
  taskId: string;
  sandbox?: boolean;
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

export interface GenerationProcessorHandle {
  worker: Worker<JobData>;
  close: () => Promise<void>;
}

interface PublicError {
  code: string;
  message: string;
}

function classifyError(err: unknown): {
  isAdapter: boolean;
  kind: AdapterError['kind'] | 'unknown';
  message: string;
  retryable: boolean;
  failAccount: boolean;
  publicCode: string;
} {
  if (err instanceof AdapterError) {
    const retryable = err.kind === 'rate_limit' || err.kind === 'temporary';
    const failAccount =
      err.kind === 'billing' ||
      err.kind === 'quota' ||
      err.kind === 'invalid_credentials';
    const publicCode =
      err.kind === 'validation'
        ? 'invalid_parameter'
        : err.kind === 'content_rejected'
          ? 'content_rejected'
          : err.kind === 'rate_limit'
            ? 'provider_rate_limited'
            : err.kind === 'quota'
              ? 'provider_quota_exhausted'
              : err.kind === 'invalid_credentials'
                ? 'provider_invalid_credentials'
                : err.kind === 'billing'
                  ? 'provider_billing_error'
                  : err.kind === 'temporary'
                    ? 'provider_temporary_error'
                    : 'provider_error';
    return {
      isAdapter: true,
      kind: err.kind,
      message: err.message,
      retryable,
      failAccount,
      publicCode,
    };
  }
  return {
    isAdapter: false,
    kind: 'unknown',
    message: err instanceof Error ? err.message : String(err),
    retryable: false,
    failAccount: false,
    publicCode: 'internal_error',
  };
}

function reasonFromKind(kind: AdapterError['kind']): string {
  switch (kind) {
    case 'billing':
      return 'provider_billing_error';
    case 'quota':
      return 'provider_quota_exhausted';
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'rate_limit':
      return 'rate_limit';
    case 'temporary':
      return 'temporary_error';
    case 'validation':
      return 'validation';
    case 'content_rejected':
      return 'content_rejected';
    default:
      return 'unknown';
  }
}

async function pickAccount(
  prisma: PrismaClient,
  providerId: string,
  modelId: string,
  methodId: string,
  excludeIds: string[],
): Promise<{
  id: string;
  credentials: Record<string, unknown>;
  proxyId: string | null;
} | null> {
  const candidates = await prisma.providerAccount.findMany({
    where: {
      providerId,
      status: ProviderAccountStatus.ACTIVE,
      rotationEnabled: true,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const a of candidates) {
    if (
      a.supportedModelIds.length > 0 &&
      !a.supportedModelIds.includes(modelId)
    ) {
      continue;
    }
    if (
      a.supportedMethodIds.length > 0 &&
      !a.supportedMethodIds.includes(methodId)
    ) {
      continue;
    }
    return {
      id: a.id,
      credentials: (a.credentials ?? {}) as Record<string, unknown>,
      proxyId: a.proxyId,
    };
  }
  return null;
}

// Compute provider cost via ProviderRateCard fallback if adapter didn't report.
// Mirrors RateCardService.getCost() in apps/api but inlined to avoid cross-app
// imports (worker is a separate Nest-less BullMQ runner).
async function computeProviderCostFallback(
  prisma: PrismaClient,
  providerId: string,
  modelId: string,
  methodId: string,
  params: Record<string, unknown>,
): Promise<bigint | null> {
  const now = new Date();
  const candidates = await prisma.providerRateCard.findMany({
    where: {
      providerId,
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
    },
    orderBy: { validFrom: 'desc' },
  });
  if (candidates.length === 0) return null;
  const mode = (params.mode as string | undefined) ?? null;
  const resolution = (params.resolution as string | undefined) ?? null;
  const durationSeconds =
    (params.durationSeconds as number | undefined) ??
    (params.duration as number | undefined) ??
    null;
  const aspectRatio = (params.aspectRatio as string | undefined) ?? null;
  const imagesCount = (params.numberOfImages as number | undefined) ?? 1;
  const ranked = candidates
    .map((c) => {
      let score = 0;
      if (c.modelId && c.modelId !== modelId) return { card: c, score: -1 };
      if (c.methodId && c.methodId !== methodId) return { card: c, score: -1 };
      if (c.mode && c.mode !== mode) return { card: c, score: -1 };
      if (c.resolution && c.resolution !== resolution) return { card: c, score: -1 };
      if (c.durationSeconds != null && c.durationSeconds !== durationSeconds) {
        return { card: c, score: -1 };
      }
      if (c.aspectRatio && c.aspectRatio !== aspectRatio) return { card: c, score: -1 };
      if (c.modelId) score += 8;
      if (c.methodId) score += 4;
      if (c.mode) score += 2;
      if (c.resolution) score += 2;
      if (c.durationSeconds != null) score += 1;
      if (c.aspectRatio) score += 1;
      return { card: c, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  const card = ranked[0]!.card;
  switch (card.priceType) {
    case 'PER_REQUEST':
      return card.providerCostUnits ?? 0n;
    case 'PER_SECOND':
      return (card.pricePerSecond ?? 0n) * BigInt(durationSeconds ?? 0);
    case 'PER_IMAGE':
      return (card.pricePerImage ?? 0n) * BigInt(imagesCount ?? 1);
    default:
      return card.providerCostUnits ?? 0n;
  }
}

async function captureReservation(
  prisma: PrismaClient,
  taskId: string,
  providerCostUnits?: bigint | null,
): Promise<void> {
  const reservation = await prisma.reservation.findFirst({
    where: { taskId, status: ReservationStatus.PENDING },
  });
  if (!reservation) return;
  const idemKey = `reservation:${reservation.id}:capture`;
  await prisma.$transaction(async (tx) => {
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

async function releaseReservation(
  prisma: PrismaClient,
  taskId: string,
  note: string,
): Promise<void> {
  const reservation = await prisma.reservation.findFirst({
    where: { taskId, status: ReservationStatus.PENDING },
  });
  if (!reservation) return;
  const idemKey = `reservation:${reservation.id}:release`;
  await prisma.$transaction(async (tx) => {
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

async function failTask(
  prisma: PrismaClient,
  taskId: string,
  err: PublicError,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: { apiRequest: true },
    });
    if (!task) return;
    if (
      task.status === TaskStatus.SUCCEEDED ||
      task.status === TaskStatus.FAILED ||
      task.status === TaskStatus.CANCELLED
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
      where: { id: task.apiRequestId },
      data: {
        status: ApiRequestStatus.FINALIZED,
        errorCode: err.code,
        errorMessage: err.message.slice(0, 1000),
        finalizedAt: new Date(),
      },
    });
  });
  await releaseReservation(prisma, taskId, err.code);
}

async function succeedTask(
  prisma: PrismaClient,
  opts: {
    taskId: string;
    apiRequestId: string;
    userId: string;
    providerSlug: string;
    modelSlug: string;
    methodCode: string;
    files: AdapterFile[];
    providerCostUnits?: bigint | null;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + RESULT_TTL_MS);
  await prisma.$transaction(async (tx) => {
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
  await captureReservation(prisma, opts.taskId, opts.providerCostUnits ?? null);
}

export function createGenerationWorker(opts: {
  redisUrl: string;
  prisma: PrismaClient;
  storage: WorkerStorage;
  registry: WorkerAdapterRegistry;
}): GenerationProcessorHandle {
  const connection = parseRedisUrl(opts.redisUrl);
  const { prisma, storage, registry } = opts;
  void storage; // referenced via registry; kept here for symmetry/logging
  const callbackQueue = new Queue(CALLBACK_QUEUE, { connection });
  const dlq = new Queue(DLQ, { connection });

  async function enqueueCallback(apiRequestId: string): Promise<void> {
    if (!apiRequestId) return;
    try {
      await callbackQueue.add(
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
      console.warn(
        `[generation-worker] failed to enqueue callback for ${apiRequestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const worker = new Worker<JobData>(
    QUEUE,
    async (job) => {
      const { taskId, sandbox } = job.data;

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { apiRequest: true },
      });
      if (!task) return;
      if (
        task.status === TaskStatus.SUCCEEDED ||
        task.status === TaskStatus.FAILED ||
        task.status === TaskStatus.CANCELLED
      ) {
        return;
      }

      const method = await prisma.method.findUnique({
        where: { id: task.methodId },
        include: { provider: true, model: true },
      });

      // Stage 16: sandbox short-circuit — never call real provider; emit a
      // mocked result and capture $0 so reservations and accounting still
      // settle in the same code paths as production.
      if (sandbox && method) {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.PROCESSING,
            startedAt: new Date(),
          },
        });
        const mockUrl =
          process.env.SANDBOX_PLACEHOLDER_URL ??
          (storage as unknown as { getObjectUrl?: (k: string) => string })
            .getObjectUrl?.('sandbox/placeholder.png') ??
          'https://example.com/sandbox/placeholder.png';
        const file: AdapterFile = {
          url: mockUrl,
          mimeType: 'image/png',
          bucket: 'sandbox',
          key: 'sandbox/placeholder.png',
          size: 0,
          fileType: 'image',
        };
        // Tag task metadata so downstream (analytics, exports) can filter.
        try {
          await prisma.task.update({
            where: { id: taskId },
            data: { resultData: { sandbox: true } },
          });
        } catch {
          /* swallow */
        }
        await succeedTask(prisma, {
          taskId,
          apiRequestId: task.apiRequestId,
          userId: task.userId,
          providerSlug: method.provider.code,
          modelSlug: method.model.code,
          methodCode: method.code,
          files: [file],
          providerCostUnits: 0n,
        });
        await enqueueCallback(task.apiRequestId);
        return;
      }

      if (!method) {
        await failTask(prisma, taskId, {
          code: 'method_not_found',
          message: `Method ${task.methodId} not found`,
        });
        await enqueueCallback(task.apiRequestId);
        return;
      }

      const adapter = registry.find(
        method.provider.code,
        method.model.code,
        method.code,
      );
      if (!adapter) {
        await failTask(prisma, taskId, {
          code: NOT_IMPLEMENTED,
          message: `No adapter for ${method.provider.code}/${method.model.code}/${method.code}`,
        });
        await enqueueCallback(task.apiRequestId);
        return;
      }

      // Mark task as processing
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.PROCESSING, startedAt: new Date() },
      });

      const tried: string[] = [];
      let attemptNumber = await prisma.providerAttempt.count({
        where: { taskId },
      });
      const params = (task.apiRequest.paramsRaw ?? {}) as Record<string, unknown>;

      // Stage 11 (full): rotate up to N accounts. The worker switches on
      // billing/quota/invalid_credentials and on retryable errors after a
      // single retry (BullMQ already handles BackoffRetry across job
      // attempts; here N controls intra-attempt account switching).
      const maxAccountAttempts = Math.max(
        1,
        Number(process.env.MAX_PROVIDER_ACCOUNT_ATTEMPTS_PER_TASK ?? 3),
      );
      for (let attempt = 0; attempt < maxAccountAttempts; attempt++) {
        const acc = await pickAccount(
          prisma,
          method.providerId,
          method.modelId,
          method.id,
          tried,
        );
        if (!acc) {
          await failTask(prisma, taskId, {
            code: 'no_available_provider_account',
            message: 'No active provider account matches this task',
          });
          await enqueueCallback(task.apiRequestId);
          return;
        }
        tried.push(acc.id);

        let proxyCtx: AdapterContext['proxy'] | undefined;
        if (acc.proxyId) {
          const proxy = await prisma.proxy.findUnique({
            where: { id: acc.proxyId },
          });
          if (!proxy || proxy.status !== ProxyStatus.ACTIVE) {
            await failTask(prisma, taskId, {
              code: 'proxy_unavailable',
              message: `Proxy for account ${acc.id} not active`,
            });
            await enqueueCallback(task.apiRequestId);
            return;
          }
          proxyCtx = {
            host: proxy.host,
            port: proxy.port,
            protocol: proxy.protocol,
            login: proxy.login ?? undefined,
            password: proxy.passwordHash ?? undefined,
          };
        }

        attemptNumber += 1;
        const attemptStart = new Date();
        const attemptRow = await prisma.providerAttempt.create({
          data: {
            taskId,
            attemptNumber,
            providerId: method.providerId,
            providerAccountId: acc.id,
            proxyId: acc.proxyId,
            status: 'started',
            startedAt: attemptStart,
          },
        });

        try {
          const result = await adapter.execute({
            taskId,
            apiRequestId: task.apiRequestId,
            userId: task.userId,
            provider: { id: method.providerId, code: method.provider.code },
            model: { id: method.modelId, code: method.model.code },
            method: { id: method.id, code: method.code },
            params,
            account: { id: acc.id, credentials: acc.credentials },
            proxy: proxyCtx,
          });
          const finishedAt = new Date();
          // Resolve provider cost: adapter-reported wins; otherwise look up
          // ProviderRateCard. Stored on ProviderAttempt for analytics.
          let providerCostUnits: bigint | null = result.providerCostUnits ?? null;
          if (providerCostUnits == null) {
            providerCostUnits = await computeProviderCostFallback(
              prisma,
              method.providerId,
              method.modelId,
              method.id,
              params,
            ).catch(() => null);
          }
          await prisma.providerAttempt.update({
            where: { id: attemptRow.id },
            data: {
              status: 'success',
              finishedAt,
              durationMs: finishedAt.getTime() - attemptStart.getTime(),
              providerCostUnits: providerCostUnits ?? undefined,
            },
          });
          await prisma.providerAccount
            .update({
              where: { id: acc.id },
              data: {
                lastSuccessAt: finishedAt,
                todayRequestsCount: { increment: 1 },
                monthRequestsCount: { increment: 1 },
              },
            })
            .catch(() => undefined);

          // Async / long-running flow (e.g. Veo): adapter returned a
          // providerJobId without files. Persist it on the Task and the
          // current ProviderAttempt; PollLroCron in the API will pick the
          // task up by status=PROCESSING + providerJobId and finalise.
          if (result.pending && result.providerJobId) {
            await prisma.task.update({
              where: { id: taskId },
              data: {
                providerJobId: result.providerJobId,
                status: TaskStatus.PROCESSING,
              },
            });
            await prisma.providerAttempt.update({
              where: { id: attemptRow.id },
              data: { providerJobId: result.providerJobId },
            });
            await prisma.providerAccount
              .update({
                where: { id: acc.id },
                data: {
                  lastSuccessAt: finishedAt,
                  todayRequestsCount: { increment: 1 },
                  monthRequestsCount: { increment: 1 },
                },
              })
              .catch(() => undefined);
            return;
          }

          await succeedTask(prisma, {
            taskId,
            apiRequestId: task.apiRequestId,
            userId: task.userId,
            providerSlug: method.provider.code,
            modelSlug: method.model.code,
            methodCode: method.code,
            files: result.files ?? [],
            providerCostUnits,
          });
          await enqueueCallback(task.apiRequestId);
          return;
        } catch (err) {
          const c = classifyError(err);
          const finishedAt = new Date();
          await prisma.providerAttempt.update({
            where: { id: attemptRow.id },
            data: {
              status: 'failed',
              errorType: reasonFromKind(c.kind as AdapterError['kind']),
              errorCode: c.publicCode,
              errorMessage: c.message.slice(0, 4000),
              finishedAt,
              durationMs: finishedAt.getTime() - attemptStart.getTime(),
            },
          });

          if (c.failAccount) {
            await prisma.providerAccount
              .update({
                where: { id: acc.id },
                data: {
                  status:
                    c.kind === 'billing'
                      ? ProviderAccountStatus.EXCLUDED_BY_BILLING
                      : c.kind === 'quota'
                        ? ProviderAccountStatus.QUOTA_EXHAUSTED
                        : ProviderAccountStatus.INVALID_CREDENTIALS,
                  lastErrorAt: finishedAt,
                  // Schema has no lastErrorCode — prefix the publicCode into
                  // the message so the admin UI can pattern-match if needed.
                  lastErrorMessage: `[${c.publicCode}] ${c.message}`.slice(0, 1000),
                  excludedReason: reasonFromKind(c.kind as AdapterError['kind']),
                },
              })
              .catch(() => undefined);
            // try the next account
            continue;
          }

          // Non-fatal adapter errors (rate-limit, validation, content) — still
          // record the latest error on the account so the admin UI surfaces
          // the diagnostic without manual log diving.
          await prisma.providerAccount
            .update({
              where: { id: acc.id },
              data: {
                lastErrorAt: finishedAt,
                lastErrorMessage: `[${c.publicCode}] ${c.message}`.slice(0, 1000),
              },
            })
            .catch(() => undefined);

          // Retryable transient errors: rethrow so BullMQ applies backoff.
          // Final attempt falls through to terminal-fail path.
          if (c.retryable && (job.attemptsMade ?? 0) < MAX_ATTEMPTS - 1) {
            throw err;
          }

          // Non-account-fatal: fail immediately
          await failTask(prisma, taskId, {
            code: c.publicCode,
            message: c.message,
          });
          await enqueueCallback(task.apiRequestId);
          return;
        }
      }

      // Both attempts exhausted on account-level failures
      await failTask(prisma, taskId, {
        code: 'no_available_provider_account',
        message: 'All matching provider accounts failed (billing/quota/credentials)',
      });
      await enqueueCallback(task.apiRequestId);
      // Best-effort: raise an alert that operators can act on. We upsert by
      // dedupeKey so repeated failures don't spam.
      try {
        const dedupeKey = `provider_no_accounts:${method.providerId}`;
        await prisma.alert.upsert({
          where: { dedupeKey },
          update: {
            status: 'OPEN',
            updatedAt: new Date(),
            message: `Provider ${method.provider.code}: ${tried.length} accounts failed back-to-back (last task ${taskId})`,
          },
          create: {
            category: 'PROVIDER_NO_ACCOUNTS',
            severity: 'CRITICAL',
            status: 'OPEN',
            title: `No accounts available for ${method.provider.code}`,
            message: `Provider ${method.provider.code}: ${tried.length} accounts failed back-to-back (task ${taskId})`,
            targetType: 'provider',
            targetId: method.providerId,
            dedupeKey,
          },
        });
      } catch (err) {
        console.warn(
          `[generation-worker] failed to raise PROVIDER_NO_ACCOUNTS alert: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[generation-worker] job ${job?.id ?? '?'} failed: ${err.message}`,
    );
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    if (attemptsMade >= MAX_ATTEMPTS) {
      // Move data into DLQ for inspection / manual retry.
      dlq
        .add('generation-dlq', job.data, {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 1,
        })
        .catch(() => undefined);
      // Best-effort: terminate the task and release its reservation so the
      // user is not stuck holding funds. Idempotent — failTask is a no-op
      // if the task already moved to a terminal status.
      const data = job.data as JobData | undefined;
      if (data?.taskId) {
        void (async () => {
          try {
            await failTask(prisma, data.taskId, {
              code: 'dead_letter',
              message: `Job exhausted ${attemptsMade} attempts: ${err.message}`,
            });
            await enqueueCallback(
              (
                await prisma.task.findUnique({
                  where: { id: data.taskId },
                  select: { apiRequestId: true },
                })
              )?.apiRequestId ?? '',
            );
          } catch {
            /* swallow — best-effort cleanup */
          }
        })();
      }
    }
  });

  return {
    worker,
    close: async () => {
      await worker.close();
      await callbackQueue.close();
      await dlq.close();
    },
  };
}
