import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Deposit,
  DepositStatus,
  PaymentProvider as PaymentProviderEnum,
  Prisma,
  TransactionType,
} from '@aiagg/db';
import { fromCents, NANO_PER_CENT, NANO_PER_DOLLAR } from '@aiagg/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import { BillingService } from '../billing/billing.service';
import { CouponsService } from '../coupons/coupons.service';
import type { PaymentProviderSlug } from './payment-provider.interface';
import { PaymentProviderRegistry } from './payment-provider.registry';

export interface CreateDepositResult {
  depositId: string;
  payUrl: string;
  expiresAt: Date | null;
  status: DepositStatus;
}

const DEFAULT_MIN_USD = 5;
const DEFAULT_MAX_USD = 10000;

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly billing: BillingService,
    private readonly coupons: CouponsService,
    private readonly config: ConfigService,
  ) {}

  // -----------------------------------------------------------------------
  // Public surface
  // -----------------------------------------------------------------------

  async createDeposit(
    userId: string,
    amountCents: number,
    providerSlug: PaymentProviderSlug = PaymentProviderEnum.CRYPTOMUS,
    couponCode?: string,
  ): Promise<CreateDepositResult> {
    // Validate coupon up-front so the user gets immediate feedback before the
    // provider invoice is created. Throws on invalid/expired/wrong-context.
    let normalisedCouponCode: string | null = null;
    if (couponCode && couponCode.trim().length > 0) {
      const validation = await this.coupons.validate(
        couponCode,
        userId,
        'topup',
      );
      normalisedCouponCode = validation.code;
    }
    const min = Number(this.config.get<string>('DEPOSIT_MIN_USD') ?? DEFAULT_MIN_USD);
    const max = Number(this.config.get<string>('DEPOSIT_MAX_USD') ?? DEFAULT_MAX_USD);
    const usd = amountCents / 100;
    if (!Number.isFinite(usd) || usd <= 0) {
      throw new BadRequestException({ message: 'amountCents must be positive' });
    }
    if (usd < min) {
      throw new BadRequestException({
        message: `Minimum deposit is ${min} USD`,
      });
    }
    if (usd > max) {
      throw new BadRequestException({
        message: `Maximum deposit is ${max} USD`,
      });
    }

    const provider = this.registry.get(providerSlug);
    const amountUnits = fromCents(amountCents).units;
    const externalOrderId = `ord_${randomUUID()}`;
    const amountStr = (amountCents / 100).toFixed(2);

    // 1. Insert deposit row in CREATED state. We reserve the externalInvoiceId
    //    via a placeholder until provider returns the real one — Prisma's
    //    `(provider, externalInvoiceId)` unique constraint allows duplicates
    //    only across DIFFERENT deposit ids, so we use the deposit id itself
    //    as the placeholder (guaranteed unique).
    const depositId = randomUUID();
    await this.prisma.deposit.create({
      data: {
        id: depositId,
        userId,
        provider: providerSlug,
        externalInvoiceId: `pending_${depositId}`,
        externalOrderId,
        status: DepositStatus.CREATED,
        amountUnits,
        amountAsked: new Prisma.Decimal(amountStr),
        rawCreatePayload: {} as Prisma.InputJsonValue,
        couponCode: normalisedCouponCode,
      },
    });

    // 2. Call provider. Webhook path is derived from the provider slug so each
    //    provider receives callbacks on its own controller.
    const callbackUrl = `${(
      this.config.get<string>('WEBHOOK_BASE_URL') ?? 'http://localhost:4000'
    ).replace(/\/$/, '')}/webhooks/${providerSlug.toLowerCase()}`;
    const returnUrl = this.config.get<string>('WEB_URL')
      ? `${this.config.get<string>('WEB_URL')}/dashboard/top-up/${depositId}`
      : undefined;

    let invoiceResult;
    try {
      invoiceResult = await provider.createInvoice({
        orderId: externalOrderId,
        amountUSD: amountStr,
        callbackUrl,
        returnUrl,
        lifetimeSeconds: 7200,
      });
    } catch (err) {
      // mark deposit failed for visibility
      await this.prisma.deposit.update({
        where: { id: depositId },
        data: { status: DepositStatus.FAILED, failedAt: new Date() },
      });
      throw err;
    }

    // 3. Update deposit with invoice details.
    const updated = await this.prisma.deposit.update({
      where: { id: depositId },
      data: {
        externalInvoiceId: invoiceResult.externalInvoiceId,
        payUrl: invoiceResult.payUrl,
        expiresAt: invoiceResult.expiresAt ?? null,
        status: DepositStatus.PENDING_PAYMENT,
        rawCreatePayload: invoiceResult.raw as Prisma.InputJsonValue,
      },
    });

    return {
      depositId: updated.id,
      payUrl: updated.payUrl ?? invoiceResult.payUrl,
      expiresAt: updated.expiresAt ?? null,
      status: updated.status,
    };
  }

  async getDeposit(userId: string, id: string): Promise<Deposit> {
    const d = await this.prisma.deposit.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Deposit not found');
    if (d.userId !== userId) throw new ForbiddenException('Not your deposit');
    return d;
  }

  async listDeposits(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ items: Deposit[]; total: number; page: number; pageSize: number }> {
    const ps = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * ps;
    const [items, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: ps,
      }),
      this.prisma.deposit.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize: ps };
  }

  async adminListDeposits(filter: {
    userId?: string;
    status?: DepositStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: Deposit[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.DepositWhereInput = {};
    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;
    const [items, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.deposit.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async adminGetDeposit(id: string): Promise<Deposit> {
    const d = await this.prisma.deposit.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Deposit not found');
    return d;
  }

  // -----------------------------------------------------------------------
  // Webhook
  // -----------------------------------------------------------------------

  async handleWebhook(
    providerSlug: PaymentProviderSlug,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!this.registry.has(providerSlug)) {
      return { ok: false, reason: 'unknown_provider' };
    }
    const provider = this.registry.get(providerSlug);
    const verification = provider.verifyWebhook(rawBody, headers);
    if (!verification.ok || !verification.payload) {
      this.logger.warn(
        `webhook signature failed (${providerSlug}): ${verification.reason ?? 'unknown'}`,
      );
      return { ok: false, reason: verification.reason ?? 'invalid_signature' };
    }

    let normalised;
    try {
      normalised = provider.parseWebhook(verification.payload);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`webhook parse failed (${providerSlug}): ${m}`);
      return { ok: false, reason: 'parse_error' };
    }

    const deposit = await this.prisma.deposit.findUnique({
      where: {
        provider_externalInvoiceId: {
          provider: providerSlug,
          externalInvoiceId: normalised.externalInvoiceId,
        },
      },
    });

    if (!deposit) {
      // Unknown deposit — return 200 to suppress retries; log for visibility.
      this.logger.warn(
        `webhook for unknown deposit (${providerSlug}/${normalised.externalInvoiceId})`,
      );
      return { ok: true, reason: 'deposit_not_found' };
    }

    // Append raw payload (audit trail) — outside the state transition tx so we
    // capture every webhook even on race-loss.
    const payloads = (deposit.rawWebhookPayloads ?? []) as Prisma.InputJsonValue[];
    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        rawWebhookPayloads: [
          ...payloads,
          verification.payload as Prisma.InputJsonValue,
        ],
      },
    });

    // State transition (idempotent on duplicate `paid`).
    if (normalised.status === 'paid') {
      if (deposit.status === DepositStatus.PAID) {
        return { ok: true, reason: 'already_paid' };
      }
      await this.prisma.$transaction(
        async (tx) => {
          await this.billing.credit({
            userId: deposit.userId,
            amountUnits: deposit.amountUnits,
            currency: deposit.currency,
            type: TransactionType.DEPOSIT,
            depositId: deposit.id,
            description: 'Deposit paid',
            idempotencyScope: 'deposit.webhook',
            idempotencyKey: `${providerSlug.toLowerCase()}:${normalised.externalInvoiceId}:paid`,
            metadata: {
              externalInvoiceId: normalised.externalInvoiceId,
              externalOrderId: normalised.externalOrderId,
              txid: normalised.txid ?? null,
            },
            tx: tx as PrismaTx,
          });
          await tx.deposit.update({
            where: { id: deposit.id },
            data: {
              status: DepositStatus.PAID,
              paidAt: normalised.paidAt ?? new Date(),
              paidAmount: normalised.paidAmount
                ? new Prisma.Decimal(normalised.paidAmount)
                : null,
              paidCurrency: normalised.paidCurrency ?? null,
              txid: normalised.txid ?? null,
            },
          });
          // Apply top-up coupon bonus inside the same tx, if one is attached.
          // Failure must NOT roll back the deposit credit — log and swallow.
          if (deposit.couponCode) {
            try {
              const bonus = await this.coupons.applyTopupBonus(
                {
                  code: deposit.couponCode,
                  userId: deposit.userId,
                  depositId: deposit.id,
                  paidUnits: deposit.amountUnits,
                },
                tx as PrismaTx,
              );
              if (bonus) {
                this.logger.log(
                  `top-up coupon bonus applied: deposit=${deposit.id} bonus=${bonus.bonusUnits.toString()}`,
                );
              }
            } catch (err) {
              const m = err instanceof Error ? err.message : String(err);
              this.logger.warn(
                `top-up coupon application failed for deposit=${deposit.id}: ${m}`,
              );
            }
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { ok: true, reason: 'paid' };
    }

    if (normalised.status === 'fail') {
      if (deposit.status !== DepositStatus.FAILED) {
        await this.prisma.deposit.update({
          where: { id: deposit.id },
          data: { status: DepositStatus.FAILED, failedAt: new Date() },
        });
      }
      return { ok: true, reason: 'failed' };
    }

    if (normalised.status === 'expired') {
      if (deposit.status !== DepositStatus.EXPIRED) {
        await this.prisma.deposit.update({
          where: { id: deposit.id },
          data: { status: DepositStatus.EXPIRED, failedAt: new Date() },
        });
      }
      return { ok: true, reason: 'expired' };
    }

    if (normalised.status === 'cancel') {
      if (deposit.status !== DepositStatus.REFUNDED) {
        await this.prisma.deposit.update({
          where: { id: deposit.id },
          data: { status: DepositStatus.REFUNDED, failedAt: new Date() },
        });
      }
      return { ok: true, reason: 'cancelled' };
    }

    // pending — no state change
    return { ok: true, reason: 'pending' };
  }

  /** For testability: convert nano units back to cents. */
  static unitsToCents(units: bigint): number {
    return Number(units / NANO_PER_CENT);
  }

  /** For UI: convert nano units to USD with full precision string. */
  static unitsToDollars(units: bigint): string {
    const whole = units / NANO_PER_DOLLAR;
    const fraction = units % NANO_PER_DOLLAR;
    return `${whole}.${fraction.toString().padStart(8, '0')}`;
  }
}
