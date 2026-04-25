import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ApiRequestStatus,
  Prisma,
  TaskMode,
  TaskStatus,
} from '@aiagg/db';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { CatalogService } from '../../catalog/catalog.service';
import { BundleSpecService } from '../../catalog/bundle-spec.service';
import { PricingService } from '../../pricing/pricing.service';
import { CouponsService } from '../../coupons/coupons.service';
import { BillingService } from '../../billing/billing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GENERATION_QUEUE } from '../../bullmq/queue.constants';
import { InsufficientBalanceError } from '../../../common/errors/billing.errors';
import type { PrismaTx } from '../../../common/prisma/prisma.types';
import type { CreateGenerationDto } from '../dto/create-generation.dto';
import type { AdmitResultView, AuthContext } from '../dto/views';
import { EstimateService } from './estimate.service';

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
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue,
  ) {}

  async admit(input: {
    auth: AuthContext;
    body: CreateGenerationDto;
    idempotencyKey?: string;
    ip?: string;
    ua?: string;
  }): Promise<AdmitResultView> {
    const { auth, body } = input;
    const userId = auth.user.id;

    // -------- Pre-tx --------
    const triple = await this.catalog.resolveAndCheck(
      body.provider,
      body.model,
      body.method,
      userId,
    );
    const params = body.params;
    this.catalog.validateParamsOrThrow(triple.method, params);

    // Default mode: ASYNC if method supports it (also enforced by stub-worker).
    const requestedMode = body.mode;
    void requestedMode; // currently advisory — Stage 6 always uses ASYNC

    const bundle = await this.bundleSpec.findOrCreateFromRequest(
      { ...triple.method, provider: triple.provider, model: triple.model },
      params,
      body.mode ?? undefined,
    );

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
        { taskId },
        {
          jobId: `task:${taskId}`,
          attempts: 1,
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400, count: 1000 },
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
