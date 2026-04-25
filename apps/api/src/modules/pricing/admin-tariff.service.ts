import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  type Tariff,
  type TariffBundlePrice,
  type TariffChangeLog,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BundlePriceNotFoundError,
  TariffInUseError,
  TariffNotFoundError,
} from '../../common/errors/pricing.errors';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import { BundleService } from './bundle.service';
import { TariffService } from './tariff.service';
import { PricingEvents } from './pricing-cache.invalidator';
import type { CreateTariffDto } from './dto/create-tariff.dto';
import type { UpdateTariffDto } from './dto/update-tariff.dto';
import type {
  BatchUpsertBundlePriceDto,
  UpsertBundlePriceDto,
} from './dto/upsert-bundle-price.dto';

interface ActorContext {
  actorId?: string;
  reason?: string;
}

interface PriceComponents {
  basePriceUnits?: bigint;
  inputPerTokenUnits?: bigint;
  outputPerTokenUnits?: bigint;
  perSecondUnits?: bigint;
  perImageUnits?: bigint;
  providerCostUnits?: bigint;
  marginBps?: number;
}

function snapshotPrice(p: TariffBundlePrice | null): Record<string, unknown> | null {
  if (!p) return null;
  return {
    id: p.id,
    tariffId: p.tariffId,
    bundleId: p.bundleId,
    basePriceUnits: p.basePriceUnits?.toString() ?? null,
    inputPerTokenUnits: p.inputPerTokenUnits?.toString() ?? null,
    outputPerTokenUnits: p.outputPerTokenUnits?.toString() ?? null,
    perSecondUnits: p.perSecondUnits?.toString() ?? null,
    perImageUnits: p.perImageUnits?.toString() ?? null,
    providerCostUnits: p.providerCostUnits?.toString() ?? null,
    marginBps: p.marginBps,
    currency: p.currency,
    effectiveFrom: p.effectiveFrom.toISOString(),
  };
}

function snapshotTariff(t: Tariff): Record<string, unknown> {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    isDefault: t.isDefault,
    isActive: t.isActive,
    currency: t.currency,
  };
}

@Injectable()
export class AdminTariffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tariffs: TariffService,
    private readonly bundles: BundleService,
    private readonly events: EventEmitter2,
  ) {}

  async createTariff(input: CreateTariffDto, ctx: ActorContext): Promise<Tariff> {
    const tariff = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tariff.create({
        data: {
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          isDefault: input.isDefault ?? false,
          isActive: input.isActive ?? true,
        },
      });
      // Defer setDefault handling: if this one is default, swap others off.
      if (created.isDefault) {
        await tx.tariff.updateMany({
          where: { id: { not: created.id }, isDefault: true },
          data: { isDefault: false },
        });
      }
      await this.writeChangeLog(tx as PrismaTx, {
        tariffId: created.id,
        action: 'tariff.create',
        before: null,
        after: snapshotTariff(created),
        ctx,
      });
      return created;
    });

    this.events.emit(PricingEvents.InvalidateAll, {});
    return tariff;
  }

  async updateTariff(
    id: string,
    input: UpdateTariffDto,
    ctx: ActorContext,
  ): Promise<Tariff> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.tariff.findUnique({ where: { id } });
      if (!before) throw new TariffNotFoundError(id);
      const after = await tx.tariff.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          description: input.description ?? undefined,
          isActive: input.isActive ?? undefined,
        },
      });
      await this.writeChangeLog(tx as PrismaTx, {
        tariffId: id,
        action: 'tariff.update',
        before: snapshotTariff(before),
        after: snapshotTariff(after),
        ctx,
      });
      return after;
    });
    this.events.emit(PricingEvents.InvalidateAll, {});
    return updated;
  }

  async setDefault(id: string, ctx: ActorContext): Promise<Tariff> {
    const tariff = await this.prisma.$transaction(async (tx) => {
      const target = await tx.tariff.findUnique({ where: { id } });
      if (!target) throw new TariffNotFoundError(id);
      await tx.tariff.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      const updated = await tx.tariff.update({
        where: { id },
        data: { isDefault: true },
      });
      await this.writeChangeLog(tx as PrismaTx, {
        tariffId: id,
        action: 'tariff.set_default',
        before: snapshotTariff(target),
        after: snapshotTariff(updated),
        ctx,
      });
      return updated;
    });
    this.events.emit(PricingEvents.InvalidateAll, {});
    return tariff;
  }

  async deleteTariff(id: string, ctx: ActorContext): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.tariff.findUnique({ where: { id } });
      if (!t) throw new TariffNotFoundError(id);
      if (t.isDefault) throw new TariffInUseError(id, 'is the default tariff');
      const userCount = await tx.userTariff.count({ where: { tariffId: id } });
      if (userCount > 0) {
        throw new TariffInUseError(id, `${userCount} users assigned`);
      }
      await tx.tariffBundlePrice.deleteMany({ where: { tariffId: id } });
      await tx.tariff.delete({ where: { id } });
      await this.writeChangeLog(tx as PrismaTx, {
        tariffId: id,
        action: 'tariff.delete',
        before: snapshotTariff(t),
        after: null,
        ctx,
      });
    });
    this.events.emit(PricingEvents.InvalidateAll, {});
    return { ok: true };
  }

  async upsertBundlePrice(
    tariffId: string,
    bundleId: string,
    input: UpsertBundlePriceDto,
    ctx: ActorContext,
  ): Promise<TariffBundlePrice> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const tariff = await tx.tariff.findUnique({ where: { id: tariffId } });
      if (!tariff) throw new TariffNotFoundError(tariffId);
      const bundle = await tx.bundle.findUnique({ where: { id: bundleId } });
      if (!bundle) throw new BundlePriceNotFoundError(tariffId, bundleId);

      const before = await tx.tariffBundlePrice.findUnique({
        where: { tariffId_bundleId: { tariffId, bundleId } },
      });
      const after = await this.upsertOne(tx as PrismaTx, tariffId, bundleId, input);
      await this.writeChangeLog(tx as PrismaTx, {
        tariffId,
        bundleId,
        action: 'tariff_bundle_price.upsert',
        before: snapshotPrice(before),
        after: snapshotPrice(after),
        ctx: { ...ctx, reason: input.reason ?? ctx.reason },
      });
      return after;
    });
    this.events.emit(PricingEvents.InvalidateAll, {});
    return updated;
  }

  async batchUpsertBundlePrices(
    tariffId: string,
    input: BatchUpsertBundlePriceDto,
    ctx: ActorContext,
  ): Promise<TariffBundlePrice[]> {
    const out = await this.prisma.$transaction(async (tx) => {
      const tariff = await tx.tariff.findUnique({ where: { id: tariffId } });
      if (!tariff) throw new TariffNotFoundError(tariffId);

      const results: TariffBundlePrice[] = [];
      for (const item of input.items) {
        const bundle = await tx.bundle.findUnique({ where: { id: item.bundleId } });
        if (!bundle) {
          throw new BundlePriceNotFoundError(tariffId, item.bundleId);
        }
        const before = await tx.tariffBundlePrice.findUnique({
          where: {
            tariffId_bundleId: { tariffId, bundleId: item.bundleId },
          },
        });
        const after = await this.upsertOne(tx as PrismaTx, tariffId, item.bundleId, item);
        await this.writeChangeLog(tx as PrismaTx, {
          tariffId,
          bundleId: item.bundleId,
          action: 'tariff_bundle_price.upsert',
          before: snapshotPrice(before),
          after: snapshotPrice(after),
          ctx: { ...ctx, reason: item.reason ?? ctx.reason },
        });
        results.push(after);
      }
      return results;
    });
    this.events.emit(PricingEvents.InvalidateAll, {});
    return out;
  }

  async deleteBundlePrice(
    tariffId: string,
    bundleId: string,
    ctx: ActorContext,
  ): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.tariffBundlePrice.findUnique({
        where: { tariffId_bundleId: { tariffId, bundleId } },
      });
      if (!before) throw new BundlePriceNotFoundError(tariffId, bundleId);
      await tx.tariffBundlePrice.delete({
        where: { tariffId_bundleId: { tariffId, bundleId } },
      });
      await this.writeChangeLog(tx as PrismaTx, {
        tariffId,
        bundleId,
        action: 'tariff_bundle_price.delete',
        before: snapshotPrice(before),
        after: null,
        ctx,
      });
    });
    this.events.emit(PricingEvents.InvalidateAll, {});
    return { ok: true };
  }

  async listChanges(filter: {
    tariffId?: string;
    userId?: string;
    bundleId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: TariffChangeLog[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.TariffChangeLogWhereInput = {};
    if (filter.tariffId) where.tariffId = filter.tariffId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.bundleId) where.bundleId = filter.bundleId;

    const [items, total] = await Promise.all([
      this.prisma.tariffChangeLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tariffChangeLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async upsertOne(
    tx: PrismaTx,
    tariffId: string,
    bundleId: string,
    components: PriceComponents,
  ): Promise<TariffBundlePrice> {
    return tx.tariffBundlePrice.upsert({
      where: { tariffId_bundleId: { tariffId, bundleId } },
      create: {
        tariffId,
        bundleId,
        basePriceUnits: components.basePriceUnits ?? null,
        inputPerTokenUnits: components.inputPerTokenUnits ?? null,
        outputPerTokenUnits: components.outputPerTokenUnits ?? null,
        perSecondUnits: components.perSecondUnits ?? null,
        perImageUnits: components.perImageUnits ?? null,
        providerCostUnits: components.providerCostUnits ?? null,
        marginBps: components.marginBps ?? null,
      },
      update: {
        basePriceUnits: components.basePriceUnits ?? null,
        inputPerTokenUnits: components.inputPerTokenUnits ?? null,
        outputPerTokenUnits: components.outputPerTokenUnits ?? null,
        perSecondUnits: components.perSecondUnits ?? null,
        perImageUnits: components.perImageUnits ?? null,
        providerCostUnits: components.providerCostUnits ?? null,
        marginBps: components.marginBps ?? null,
        effectiveFrom: new Date(),
      },
    });
  }

  async writeChangeLog(
    tx: PrismaTx,
    payload: {
      tariffId?: string;
      userId?: string;
      bundleId?: string;
      action: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      ctx: ActorContext;
    },
  ): Promise<void> {
    await tx.tariffChangeLog.create({
      data: {
        tariffId: payload.tariffId ?? null,
        userId: payload.userId ?? null,
        bundleId: payload.bundleId ?? null,
        action: payload.action,
        before: (payload.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        after: (payload.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        changedById: payload.ctx.actorId ?? null,
        reason: payload.ctx.reason ?? null,
      },
    });
  }
}
