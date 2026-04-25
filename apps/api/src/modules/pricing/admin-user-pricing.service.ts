import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type Tariff,
  type UserBundlePrice,
  type UserTariff,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BundleNotFoundError,
  TariffNotFoundError,
  UserBundlePriceNotFoundError,
} from '../../common/errors/pricing.errors';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import { AdminTariffService } from './admin-tariff.service';
import { PricingEvents } from './pricing-cache.invalidator';
import type { UpsertUserBundlePriceDto } from './dto/upsert-user-bundle-price.dto';

interface ActorContext {
  actorId?: string;
  reason?: string;
}

function snapshotUserTariff(
  ut: UserTariff & { tariff: Tariff },
): Record<string, unknown> {
  return {
    id: ut.id,
    userId: ut.userId,
    tariffId: ut.tariffId,
    tariffSlug: ut.tariff.slug,
    reason: ut.reason,
  };
}

function snapshotUserBundlePrice(
  p: UserBundlePrice | null,
): Record<string, unknown> | null {
  if (!p) return null;
  return {
    id: p.id,
    userId: p.userId,
    bundleId: p.bundleId,
    basePriceUnits: p.basePriceUnits?.toString() ?? null,
    inputPerTokenUnits: p.inputPerTokenUnits?.toString() ?? null,
    outputPerTokenUnits: p.outputPerTokenUnits?.toString() ?? null,
    perSecondUnits: p.perSecondUnits?.toString() ?? null,
    perImageUnits: p.perImageUnits?.toString() ?? null,
    currency: p.currency,
    reason: p.reason,
    effectiveFrom: p.effectiveFrom.toISOString(),
  };
}

@Injectable()
export class AdminUserPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly tariffAdmin: AdminTariffService,
  ) {}

  async assignTariff(
    userId: string,
    tariffId: string,
    ctx: ActorContext,
  ): Promise<UserTariff & { tariff: Tariff }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const tariff = await tx.tariff.findUnique({ where: { id: tariffId } });
      if (!tariff) throw new TariffNotFoundError(tariffId);
      const before = await tx.userTariff.findUnique({
        where: { userId },
        include: { tariff: true },
      });
      const upserted = await tx.userTariff.upsert({
        where: { userId },
        create: {
          userId,
          tariffId,
          assignedById: ctx.actorId ?? null,
          reason: ctx.reason ?? null,
        },
        update: {
          tariffId,
          assignedById: ctx.actorId ?? null,
          reason: ctx.reason ?? null,
        },
        include: { tariff: true },
      });
      await this.tariffAdmin.writeChangeLog(tx as PrismaTx, {
        userId,
        tariffId,
        action: 'user_tariff.assign',
        before: before ? snapshotUserTariff(before) : null,
        after: snapshotUserTariff(upserted),
        ctx,
      });
      return upserted;
    });
    this.events.emit(PricingEvents.InvalidateUser, { userId });
    return result;
  }

  async removeAssignment(userId: string, ctx: ActorContext): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.userTariff.findUnique({
        where: { userId },
        include: { tariff: true },
      });
      if (!before) return;
      await tx.userTariff.delete({ where: { userId } });
      await this.tariffAdmin.writeChangeLog(tx as PrismaTx, {
        userId,
        tariffId: before.tariffId,
        action: 'user_tariff.unassign',
        before: snapshotUserTariff(before),
        after: null,
        ctx,
      });
    });
    this.events.emit(PricingEvents.InvalidateUser, { userId });
    return { ok: true };
  }

  async upsertUserBundlePrice(
    userId: string,
    bundleId: string,
    input: UpsertUserBundlePriceDto,
    ctx: ActorContext,
  ): Promise<UserBundlePrice> {
    const result = await this.prisma.$transaction(async (tx) => {
      const bundle = await tx.bundle.findUnique({ where: { id: bundleId } });
      if (!bundle) throw new BundleNotFoundError(bundleId);
      const before = await tx.userBundlePrice.findUnique({
        where: { userId_bundleId: { userId, bundleId } },
      });
      const data = {
        basePriceUnits: input.basePriceUnits ?? null,
        inputPerTokenUnits: input.inputPerTokenUnits ?? null,
        outputPerTokenUnits: input.outputPerTokenUnits ?? null,
        perSecondUnits: input.perSecondUnits ?? null,
        perImageUnits: input.perImageUnits ?? null,
      };
      const upserted = await tx.userBundlePrice.upsert({
        where: { userId_bundleId: { userId, bundleId } },
        create: {
          userId,
          bundleId,
          ...data,
          reason: input.reason ?? null,
          setById: ctx.actorId ?? null,
        },
        update: {
          ...data,
          reason: input.reason ?? null,
          setById: ctx.actorId ?? null,
          effectiveFrom: new Date(),
        },
      });
      await this.tariffAdmin.writeChangeLog(tx as PrismaTx, {
        userId,
        bundleId,
        action: 'user_bundle_price.upsert',
        before: snapshotUserBundlePrice(before),
        after: snapshotUserBundlePrice(upserted),
        ctx: { ...ctx, reason: input.reason ?? ctx.reason },
      });
      return { upserted, bundleKey: bundle.bundleKey };
    });
    this.events.emit(PricingEvents.InvalidateUserBundle, {
      userId,
      bundleKey: result.bundleKey,
    });
    return result.upserted;
  }

  async removeUserBundlePrice(
    userId: string,
    bundleId: string,
    ctx: ActorContext,
  ): Promise<{ ok: true }> {
    const bundleKey = await this.prisma.$transaction(async (tx) => {
      const before = await tx.userBundlePrice.findUnique({
        where: { userId_bundleId: { userId, bundleId } },
      });
      if (!before) throw new UserBundlePriceNotFoundError(userId, bundleId);
      const bundle = await tx.bundle.findUnique({ where: { id: bundleId } });
      await tx.userBundlePrice.delete({
        where: { userId_bundleId: { userId, bundleId } },
      });
      await this.tariffAdmin.writeChangeLog(tx as PrismaTx, {
        userId,
        bundleId,
        action: 'user_bundle_price.delete',
        before: snapshotUserBundlePrice(before),
        after: null,
        ctx,
      });
      return bundle?.bundleKey ?? '';
    });
    if (bundleKey) {
      this.events.emit(PricingEvents.InvalidateUserBundle, { userId, bundleKey });
    } else {
      this.events.emit(PricingEvents.InvalidateUser, { userId });
    }
    return { ok: true };
  }

  async listUserBundlePrices(userId: string): Promise<UserBundlePrice[]> {
    return this.prisma.userBundlePrice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
