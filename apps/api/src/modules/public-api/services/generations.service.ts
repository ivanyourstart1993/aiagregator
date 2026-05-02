import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { checkUrlShape } from '@aiagg/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ApiRequestStatus,
  Prisma,
  TaskMode,
  TaskStatus,
  UserStatus,
} from '@aiagg/db';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { CatalogService } from '../../catalog/catalog.service';
import { BundleSpecService } from '../../catalog/bundle-spec.service';
import { PricingService } from '../../pricing/pricing.service';
import { CouponsService } from '../../coupons/coupons.service';
import { BillingService } from '../../billing/billing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IOREDIS_CLIENT } from '../../../common/redis/redis.module';
import { GENERATION_QUEUE } from '../../bullmq/queue.constants';
import { InsufficientBalanceError } from '../../../common/errors/billing.errors';
import {
  BundlePausedError,
  ProviderPausedError,
  QueueOverloadedError,
  RateLimitExceededError,
  UserBlockedError,
} from '../../../common/errors/public-api.errors';
import type { PrismaTx } from '../../../common/prisma/prisma.types';
import type { CreateGenerationDto } from '../dto/create-generation.dto';
import type { AdmitResultView, AuthContext } from '../dto/views';
import { EstimateService } from './estimate.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    private readonly catalog: CatalogService,
    private readonly bundleSpec: BundleSpecService,
    private readonly pricing: PricingService,
    private readonly coupons: CouponsService,
    private readonly billing: BillingService,
    private readonly estimate: EstimateService,
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue,
    @Inject(IOREDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private async enforceAntiAbuse(userId: string, sandbox: boolean): Promise<void> {
    // 1) User status: SUSPENDED / DELETED → user_blocked.
    // We also pull the per-user rate-limit overrides here in the same
    // round-trip so the rest of the function can apply them without an
    // extra query.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        sandboxEnabled: true,
        maxConcurrentTasks: true,
        maxRequestsPerDayPerUser: true,
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UserBlockedError(userId);
    }
    if (sandbox) return; // sandbox bypasses concurrency / daily caps

    // 2) Per-user concurrency cap (override > env default).
    const concurrentEnv = Number(process.env.MAX_CONCURRENT_PER_USER ?? 10);
    const concurrentLimit = Math.max(
      1,
      typeof user.maxConcurrentTasks === 'number' && user.maxConcurrentTasks > 0
        ? user.maxConcurrentTasks
        : concurrentEnv,
    );
    const concurrent = await this.prisma.task.count({
      where: {
        userId,
        status: { in: [TaskStatus.PENDING, TaskStatus.PROCESSING] },
      },
    });
    if (concurrent >= concurrentLimit) {
      throw new RateLimitExceededError(concurrentLimit, 60, 60);
    }

    // 3) Daily request cap, tracked in Redis (per UTC day).
    const dailyEnv = Number(process.env.MAX_REQUESTS_PER_DAY_PER_USER ?? 10000);
    const dailyLimit = Math.max(
      1,
      typeof user.maxRequestsPerDayPerUser === 'number' && user.maxRequestsPerDayPerUser > 0
        ? user.maxRequestsPerDayPerUser
        : dailyEnv,
    );
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `user:${userId}:gen-day:${day}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, 90_000); // ~25h
      }
      if (count > dailyLimit) {
        throw new RateLimitExceededError(dailyLimit, 86_400, 3600);
      }
    } catch (err) {
      if (err instanceof RateLimitExceededError) throw err;
      // Fail-open on Redis errors — don't block the user.
      this.logger.warn(
        `daily-cap redis error for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async admit(input: {
    auth: AuthContext;
    body: CreateGenerationDto;
    idempotencyKey?: string;
    ip?: string;
    ua?: string;
  }): Promise<AdmitResultView> {
    const { auth, body } = input;
    const userId = auth.user.id;

    // -------- Stage 16: anti-abuse + sandbox detection --------
    const userRow = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sandboxEnabled: true },
    });
    const sandbox = Boolean(userRow?.sandboxEnabled);
    await this.enforceAntiAbuse(userId, sandbox);

    // -------- Stage 14: pause gates --------
    if (await this.settings.isPaused('generation.queue.paused')) {
      throw new QueueOverloadedError('queue_paused');
    }

    // -------- Pre-tx --------
    const triple = await this.catalog.resolveAndCheck(
      body.provider,
      body.model,
      body.method,
      userId,
    );

    if (await this.settings.isPaused(`provider.${triple.provider.code}.paused`)) {
      throw new ProviderPausedError(triple.provider.code);
    }
    const params = body.params;
    this.catalog.validateParamsOrThrow(triple.method, params);

    // Reject obviously-unsafe callback URLs at submit time. The worker
    // re-checks via DNS-resolving safeFetch, but failing fast here gives
    // the user a clear error and prevents the row from being persisted.
    if (body.callback_url) {
      const reason = checkUrlShape(body.callback_url, { allowHttp: false });
      if (reason) {
        throw new BadRequestException({
          code: 'invalid_callback_url',
          message: `callback_url rejected: ${reason}`,
        });
      }
    }

    // Default mode: ASYNC if method supports it (also enforced by stub-worker).
    const requestedMode = body.mode;
    void requestedMode; // currently advisory — Stage 6 always uses ASYNC

    const bundle = await this.bundleSpec.findOrCreateFromRequest(
      { ...triple.method, provider: triple.provider, model: triple.model },
      params,
      body.mode ?? undefined,
    );

    if (await this.settings.isPaused(`bundle.${bundle.bundleKey}.paused`)) {
      throw new BundlePausedError(bundle.bundleKey);
    }

    const resolved = await this.pricing.resolvePrice({
      userId,
      bundleSpec: {
        providerSlug: bundle.providerSlug,
        modelSlug: bundle.modelSlug,
        method: bundle.method,
        mode: bundle.mode,
        resolution: bundle.resolution,
        durationSeconds: bundle.durationSeconds,
        aspectRatio: bundle.aspectRatio,
        unit: bundle.unit,
      },
      persistSnapshot: true,
    });
    if (!resolved.pricingSnapshotId) {
      throw new Error('PricingService did not return a snapshot id');
    }

    const { basePriceUnits } = this.estimate.computePrice(
      bundle.unit,
      resolved.components,
      params,
    );

    let discountUnits = 0n;
    let couponId: string | null = null;
    if (body.coupon) {
      const preview = await this.coupons.previewRequestDiscount({
        code: body.coupon,
        userId,
        methodCode: triple.method.code,
        bundleId: bundle.id,
        basePriceUnits,
      });
      if (preview) {
        discountUnits = preview.discountUnits;
        couponId = preview.couponId;
      }
    }
    const clientPriceUnits =
      basePriceUnits > discountUnits ? basePriceUnits - discountUnits : 0n;

    const balances = await this.billing.getBalances(userId);
    if (balances.available < clientPriceUnits) {
      throw new InsufficientBalanceError(
        clientPriceUnits,
        balances.available,
        balances.currency,
      );
    }

    // -------- Tx --------
    const reservationIdemKey = `gen:${input.idempotencyKey ?? randomUUID()}`;

    const taskId = await this.prisma.$transaction(
      async (tx) => {
        const ptx = tx as PrismaTx;
        const reservation = await this.billing.reserve({
          userId,
          amountUnits: clientPriceUnits,
          idempotencyKey: reservationIdemKey,
          taskId: undefined,
          bundleKey: bundle.bundleKey,
          pricingSnapshotId: resolved.pricingSnapshotId,
          tx: ptx,
        });

        const apiRequest = await ptx.apiRequest.create({
          data: {
            userId,
            apiKeyId: auth.apiKey.id,
            idempotencyKey: input.idempotencyKey ?? null,
            methodId: triple.method.id,
            bundleId: bundle.id,
            bundleKey: bundle.bundleKey,
            paramsRaw: params as Prisma.InputJsonValue,
            status: ApiRequestStatus.ACCEPTED,
            basePriceUnits,
            discountUnits,
            clientPriceUnits,
            pricingSnapshotId: resolved.pricingSnapshotId,
            reservationId: reservation.id,
            couponId,
            callbackUrl: body.callback_url ?? null,
            ipAddress: input.ip ?? null,
            userAgent: input.ua ?? null,
          },
        });

        if (couponId && discountUnits > 0n) {
          await this.coupons.commitRequestRedemption(
            {
              couponId,
              userId,
              apiRequestId: apiRequest.id,
              discountUnits,
              meta: { bundleKey: bundle.bundleKey },
            },
            ptx,
          );
        }

        const task = await ptx.task.create({
          data: {
            apiRequestId: apiRequest.id,
            userId,
            methodId: triple.method.id,
            status: TaskStatus.PENDING,
            mode: TaskMode.ASYNC,
          },
        });

        await ptx.reservation.update({
          where: { id: reservation.id },
          data: { taskId: task.id },
        });

        return task.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // -------- Post-tx: enqueue --------
    try {
      await this.generationQueue.add(
        'generate',
        { taskId, sandbox },
        {
          jobId: `task-${taskId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      );
    } catch (err) {
      this.logger.error(
        `failed to enqueue generation for task ${taskId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // The cron sweeper will pick this up.
    }

    return {
      success: true,
      mode: 'async',
      status: TaskStatus.PENDING,
      task_id: taskId,
      reserved_amount: clientPriceUnits,
      currency: balances.currency,
      message: 'Generation task created',
    };
  }
}
