import { Injectable, Logger } from '@nestjs/common';
import {
  type Coupon,
  type CouponRedemption,
  CouponStatus,
  CouponType,
  Currency,
  Prisma,
  TransactionType,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import { BillingService } from '../billing/billing.service';
import {
  CouponAlreadyUsedError,
  CouponExpiredError,
  CouponInvalidError,
  CouponNotApplicableError,
} from '../../common/errors/coupon.errors';
import type {
  CouponRedemptionView,
  CouponValidationResult,
  CouponView,
} from './dto/views';
import type { Paginated, TransactionView } from '../billing/dto/views';
import { TransactionRepository } from '../billing/transaction.repository';

const STANDALONE_TYPES: ReadonlyArray<CouponType> = [
  CouponType.FIXED_AMOUNT,
  CouponType.BONUS_MONEY,
];
const REQUEST_TYPES: ReadonlyArray<CouponType> = [
  CouponType.DISCOUNT_METHOD_PERCENT,
  CouponType.DISCOUNT_BUNDLE_AMOUNT,
];
const TOPUP_TYPES: ReadonlyArray<CouponType> = [CouponType.DISCOUNT_TOPUP];

export type CouponContext = 'standalone' | 'request' | 'topup';

export interface PreviewRequestDiscountInput {
  code: string;
  userId: string;
  methodCode: string;
  bundleId?: string | null;
  basePriceUnits: bigint;
}

export interface CommitRequestRedemptionInput {
  couponId: string;
  userId: string;
  apiRequestId: string;
  discountUnits: bigint;
  meta?: Record<string, unknown>;
}

export interface ApplyTopupBonusInput {
  code: string;
  userId: string;
  depositId: string;
  paidUnits: bigint;
}

export interface RedeemStandaloneResult {
  coupon: CouponView;
  transaction: TransactionView;
}

export interface ApplyTopupBonusResult {
  bonusUnits: bigint;
  transaction: TransactionView;
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly transactionRepo: TransactionRepository,
  ) {}

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  async validate(
    code: string,
    userId: string,
    ctx?: CouponContext,
  ): Promise<CouponValidationResult> {
    const normCode = this.normaliseCode(code);
    const coupon = await this.prisma.coupon.findUnique({ where: { code: normCode } });
    if (!coupon) throw new CouponInvalidError(normCode, 'not_found');

    // Status gates
    if (coupon.status === CouponStatus.PAUSED || coupon.status === CouponStatus.DRAFT) {
      throw new CouponInvalidError(normCode, `status_${coupon.status.toLowerCase()}`);
    }
    if (coupon.status === CouponStatus.EXPIRED) {
      throw new CouponExpiredError(normCode);
    }
    if (coupon.status === CouponStatus.EXHAUSTED) {
      throw new CouponInvalidError(normCode, 'exhausted');
    }

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new CouponInvalidError(normCode, 'not_yet_active');
    }
    if (coupon.validTo && coupon.validTo < now) {
      await this.lazySyncStatus(coupon.id, CouponStatus.EXPIRED);
      throw new CouponExpiredError(normCode);
    }

    if (coupon.maxUses !== null && coupon.maxUses !== undefined) {
      const total = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id },
      });
      if (total >= coupon.maxUses) {
        await this.lazySyncStatus(coupon.id, CouponStatus.EXHAUSTED);
        throw new CouponInvalidError(normCode, 'exhausted');
      }
    }

    const userUses = await this.prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    });
    if (userUses >= coupon.maxUsesPerUser) {
      throw new CouponAlreadyUsedError(normCode);
    }

    if (ctx) this.assertContextCompatible(coupon, ctx);

    return this.toValidation(coupon);
  }

  async listRedemptions(
    userId: string,
    page = 1,
    pageSize = 50,
  ): Promise<Paginated<CouponRedemptionView>> {
    const ps = Math.min(Math.max(pageSize, 1), 200);
    const p = Math.max(page, 1);
    const where: Prisma.CouponRedemptionWhereInput = { userId };
    const [items, total] = await Promise.all([
      this.prisma.couponRedemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
        include: { coupon: { select: { code: true, type: true } } },
      }),
      this.prisma.couponRedemption.count({ where }),
    ]);
    return {
      items: items.map((r) => this.toRedemptionView(r)),
      total,
      page: p,
      pageSize: ps,
    };
  }

  async adminListRedemptions(filter: {
    couponId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<CouponRedemptionView>> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.CouponRedemptionWhereInput = {};
    if (filter.couponId) where.couponId = filter.couponId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    const [items, total] = await Promise.all([
      this.prisma.couponRedemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { coupon: { select: { code: true, type: true } } },
      }),
      this.prisma.couponRedemption.count({ where }),
    ]);
    return {
      items: items.map((r) => this.toRedemptionView(r)),
      total,
      page,
      pageSize,
    };
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  async redeemStandalone(
    code: string,
    userId: string,
  ): Promise<RedeemStandaloneResult> {
    const validation = await this.validate(code, userId, 'standalone');
    const normCode = validation.code;

    return this.prisma.$transaction(
      async (tx) => {
        const ptx = tx as PrismaTx;
        // Insert standalone redemption row first; partial unique index protects
        // against double-spend.
        try {
          await ptx.couponRedemption.create({
            data: {
              couponId: validation.couponId,
              userId,
              apiRequestId: null,
              depositId: null,
              amountUnits: validation.value,
              meta: { kind: 'standalone' } as Prisma.InputJsonValue,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new CouponAlreadyUsedError(normCode);
          }
          throw err;
        }

        const idemKey = `coupon:${normCode}:${userId}`;
        let txn;
        if (validation.type === CouponType.FIXED_AMOUNT) {
          txn = await this.billing.credit({
            userId,
            amountUnits: validation.value,
            currency: validation.currency,
            type: TransactionType.CORRECTION,
            description: `coupon:${normCode}`,
            idempotencyScope: 'coupon.standalone',
            idempotencyKey: idemKey,
            metadata: { couponCode: normCode, couponId: validation.couponId },
            tx: ptx,
          });
        } else if (validation.type === CouponType.BONUS_MONEY) {
          txn = await this.billing.grantBonus({
            userId,
            amountUnits: validation.value,
            currency: validation.currency,
            description: `coupon:${normCode}`,
            idempotencyKey: idemKey,
            metadata: { couponCode: normCode, couponId: validation.couponId },
            tx: ptx,
          });
        } else {
          throw new CouponNotApplicableError(normCode, 'wrong_type_for_standalone');
        }

        const couponRow = await ptx.coupon.findUnique({
          where: { id: validation.couponId },
        });
        if (!couponRow) throw new CouponInvalidError(normCode, 'not_found');
        return {
          coupon: this.toView(couponRow),
          transaction: this.transactionRepo.toView(txn),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Pure read — computes a discount but does NOT write CouponRedemption.
   * Returns null if the coupon does not target this method/bundle (silent skip).
   */
  async previewRequestDiscount(
    input: PreviewRequestDiscountInput,
  ): Promise<{
    couponId: string;
    discountUnits: bigint;
    type: CouponType;
  } | null> {
    const validation = await this.validate(input.code, input.userId, 'request');
    if (validation.type === CouponType.DISCOUNT_METHOD_PERCENT) {
      if (!validation.methodCode || validation.methodCode !== input.methodCode) {
        return null;
      }
      const discount = (input.basePriceUnits * validation.value) / 10000n;
      return {
        couponId: validation.couponId,
        discountUnits: discount < 0n ? 0n : discount,
        type: validation.type,
      };
    }
    if (validation.type === CouponType.DISCOUNT_BUNDLE_AMOUNT) {
      if (
        !validation.bundleId ||
        !input.bundleId ||
        validation.bundleId !== input.bundleId
      ) {
        return null;
      }
      const cap = input.basePriceUnits;
      const discount = validation.value < cap ? validation.value : cap;
      return {
        couponId: validation.couponId,
        discountUnits: discount,
        type: validation.type,
      };
    }
    return null;
  }

  /**
   * Writes a CouponRedemption row inside the admit transaction. Safeguarded by
   * the partial unique index on (couponId, userId, apiRequestId).
   */
  async commitRequestRedemption(
    input: CommitRequestRedemptionInput,
    tx: PrismaTx,
  ): Promise<CouponRedemption> {
    try {
      return await tx.couponRedemption.create({
        data: {
          couponId: input.couponId,
          userId: input.userId,
          apiRequestId: input.apiRequestId,
          depositId: null,
          amountUnits: input.discountUnits,
          meta: (input.meta ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Belongs to admit-tx — validate() should have caught this earlier; the
        // safeguard handles rare race conditions.
        throw new CouponAlreadyUsedError('');
      }
      throw err;
    }
  }

  /**
   * Called from the deposit webhook within the deposit-credit transaction.
   * Returns null silently when the coupon does not apply (e.g. minTopup gate).
   */
  async applyTopupBonus(
    input: ApplyTopupBonusInput,
    tx: PrismaTx,
  ): Promise<ApplyTopupBonusResult | null> {
    const validation = await this.validate(input.code, input.userId, 'topup');
    if (
      validation.minTopupUnits !== null &&
      validation.minTopupUnits !== undefined &&
      input.paidUnits < validation.minTopupUnits
    ) {
      return null;
    }
    const bonusUnits = (input.paidUnits * validation.value) / 10000n;
    if (bonusUnits <= 0n) return null;

    try {
      await tx.couponRedemption.create({
        data: {
          couponId: validation.couponId,
          userId: input.userId,
          apiRequestId: null,
          depositId: input.depositId,
          amountUnits: bonusUnits,
          meta: {
            kind: 'topup',
            paidUnits: input.paidUnits.toString(),
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Already applied for this deposit — idempotent no-op.
        return null;
      }
      throw err;
    }

    const txn = await this.billing.grantBonus({
      userId: input.userId,
      amountUnits: bonusUnits,
      currency: validation.currency,
      description: `coupon-topup:${validation.code}`,
      idempotencyKey: `coupon:topup:${input.depositId}`,
      metadata: {
        couponCode: validation.code,
        couponId: validation.couponId,
        depositId: input.depositId,
      },
      tx,
    });
    return { bonusUnits, transaction: this.transactionRepo.toView(txn) };
  }

  // -----------------------------------------------------------------------
  // Admin CRUD
  // -----------------------------------------------------------------------

  async adminListCoupons(filter: {
    type?: CouponType;
    status?: CouponStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<CouponView>> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.CouponWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.q) {
      const q = filter.q.trim().toUpperCase();
      where.code = { contains: q };
    }
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { items: items.map((c) => this.toView(c)), total, page, pageSize };
  }

  async adminGetCoupon(id: string): Promise<CouponView> {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c) throw new CouponInvalidError(id, 'not_found');
    return this.toView(c);
  }

  async adminCreateCoupon(input: {
    code: string;
    type: CouponType;
    value: bigint;
    currency?: Currency;
    methodCode?: string;
    bundleId?: string;
    minTopupUnits?: bigint;
    maxUses?: number;
    maxUsesPerUser?: number;
    validFrom?: string;
    validTo?: string;
    status?: CouponStatus;
    comment?: string;
    createdById?: string;
  }): Promise<CouponView> {
    const code = this.normaliseCode(input.code);
    this.validateCouponShape(input.type, input);
    const c = await this.prisma.coupon.create({
      data: {
        code,
        type: input.type,
        value: input.value,
        currency: input.currency ?? Currency.USD,
        methodCode: input.methodCode ?? null,
        bundleId: input.bundleId ?? null,
        minTopupUnits: input.minTopupUnits ?? null,
        maxUses: input.maxUses ?? null,
        maxUsesPerUser: input.maxUsesPerUser ?? 1,
        validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
        validTo: input.validTo ? new Date(input.validTo) : null,
        status: input.status ?? CouponStatus.ACTIVE,
        comment: input.comment ?? null,
        createdById: input.createdById ?? null,
      },
    });
    return this.toView(c);
  }

  async adminUpdateCoupon(
    id: string,
    input: {
      status?: CouponStatus;
      validFrom?: string;
      validTo?: string;
      maxUses?: number;
      maxUsesPerUser?: number;
      comment?: string;
      methodCode?: string;
      bundleId?: string;
      minTopupUnits?: bigint;
      value?: bigint;
    },
  ): Promise<CouponView> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new CouponInvalidError(id, 'not_found');

    const data: Prisma.CouponUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.validFrom !== undefined) data.validFrom = new Date(input.validFrom);
    if (input.validTo !== undefined) data.validTo = new Date(input.validTo);
    if (input.maxUses !== undefined) data.maxUses = input.maxUses;
    if (input.maxUsesPerUser !== undefined) data.maxUsesPerUser = input.maxUsesPerUser;
    if (input.comment !== undefined) data.comment = input.comment;
    if (input.methodCode !== undefined) data.methodCode = input.methodCode;
    if (input.bundleId !== undefined) data.bundleId = input.bundleId;
    if (input.minTopupUnits !== undefined) data.minTopupUnits = input.minTopupUnits;
    if (input.value !== undefined) data.value = input.value;

    const updated = await this.prisma.coupon.update({ where: { id }, data });
    return this.toView(updated);
  }

  async adminDeleteCoupon(id: string): Promise<{ ok: true; soft: boolean }> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new CouponInvalidError(id, 'not_found');
    const redemptions = await this.prisma.couponRedemption.count({
      where: { couponId: id },
    });
    if (redemptions > 0) {
      // Soft-delete via PAUSED status (preserves audit trail).
      await this.prisma.coupon.update({
        where: { id },
        data: { status: CouponStatus.PAUSED },
      });
      return { ok: true, soft: true };
    }
    await this.prisma.coupon.delete({ where: { id } });
    return { ok: true, soft: false };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private normaliseCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async lazySyncStatus(id: string, status: CouponStatus): Promise<void> {
    try {
      await this.prisma.coupon.update({ where: { id }, data: { status } });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`coupon ${id} status sync to ${status} failed: ${m}`);
    }
  }

  private assertContextCompatible(coupon: Coupon, ctx: CouponContext): void {
    const ok =
      (ctx === 'standalone' && STANDALONE_TYPES.includes(coupon.type)) ||
      (ctx === 'request' && REQUEST_TYPES.includes(coupon.type)) ||
      (ctx === 'topup' && TOPUP_TYPES.includes(coupon.type));
    if (!ok) {
      throw new CouponNotApplicableError(coupon.code, `wrong_context_${ctx}`);
    }
  }

  private validateCouponShape(
    type: CouponType,
    input: { methodCode?: string; bundleId?: string; minTopupUnits?: bigint },
  ): void {
    if (type === CouponType.DISCOUNT_METHOD_PERCENT && !input.methodCode) {
      throw new CouponInvalidError('', 'methodCode_required');
    }
    if (type === CouponType.DISCOUNT_BUNDLE_AMOUNT && !input.bundleId) {
      throw new CouponInvalidError('', 'bundleId_required');
    }
  }

  private toView(c: Coupon): CouponView {
    return {
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      currency: c.currency,
      methodCode: c.methodCode,
      bundleId: c.bundleId,
      minTopupUnits: c.minTopupUnits,
      maxUses: c.maxUses,
      maxUsesPerUser: c.maxUsesPerUser,
      validFrom: c.validFrom,
      validTo: c.validTo,
      status: c.status,
      comment: c.comment,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private toValidation(c: Coupon): CouponValidationResult {
    return {
      couponId: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      currency: c.currency,
      methodCode: c.methodCode,
      bundleId: c.bundleId,
      minTopupUnits: c.minTopupUnits,
      status: c.status,
      validTo: c.validTo,
    };
  }

  private toRedemptionView(
    r: CouponRedemption & { coupon?: { code: string; type: CouponType } },
  ): CouponRedemptionView {
    return {
      id: r.id,
      couponId: r.couponId,
      userId: r.userId,
      apiRequestId: r.apiRequestId,
      depositId: r.depositId,
      amountUnits: r.amountUnits,
      meta: r.meta,
      createdAt: r.createdAt,
      coupon: r.coupon ? { code: r.coupon.code, type: r.coupon.type } : undefined,
    };
  }
}
