import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Tariff,
  type TariffBundlePrice,
  type UserTariff,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DefaultTariffMissingError,
  TariffNotFoundError,
} from '../../common/errors/pricing.errors';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import type { TariffBundlePriceView, TariffView, UserTariffView } from './dto/views';

@Injectable()
export class TariffService {
  constructor(private readonly prisma: PrismaService) {}

  toView(t: Tariff): TariffView {
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      isActive: t.isActive,
      currency: t.currency,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  toUserTariffView(ut: UserTariff & { tariff: Tariff }): UserTariffView {
    return {
      id: ut.id,
      userId: ut.userId,
      tariffId: ut.tariffId,
      tariff: this.toView(ut.tariff),
      reason: ut.reason,
      assignedById: ut.assignedById,
      createdAt: ut.createdAt,
      updatedAt: ut.updatedAt,
    };
  }

  toBundlePriceView(p: TariffBundlePrice): TariffBundlePriceView {
    return {
      id: p.id,
      tariffId: p.tariffId,
      bundleId: p.bundleId,
      components: {
        basePriceUnits: p.basePriceUnits,
        inputPerTokenUnits: p.inputPerTokenUnits,
        outputPerTokenUnits: p.outputPerTokenUnits,
        perSecondUnits: p.perSecondUnits,
        perImageUnits: p.perImageUnits,
      },
      providerCostUnits: p.providerCostUnits,
      marginBps: p.marginBps,
      currency: p.currency,
      effectiveFrom: p.effectiveFrom,
    };
  }

  async getDefault(tx?: PrismaTx): Promise<Tariff> {
    const client = tx ?? this.prisma;
    const t = await client.tariff.findFirst({ where: { isDefault: true } });
    if (!t) throw new DefaultTariffMissingError();
    return t;
  }

  async findDefault(tx?: PrismaTx): Promise<Tariff | null> {
    const client = tx ?? this.prisma;
    return client.tariff.findFirst({ where: { isDefault: true } });
  }

  async getById(id: string, tx?: PrismaTx): Promise<Tariff> {
    const client = tx ?? this.prisma;
    const t = await client.tariff.findUnique({ where: { id } });
    if (!t) throw new TariffNotFoundError(id);
    return t;
  }

  async findById(id: string, tx?: PrismaTx): Promise<Tariff | null> {
    const client = tx ?? this.prisma;
    return client.tariff.findUnique({ where: { id } });
  }

  async listActive(): Promise<Tariff[]> {
    return this.prisma.tariff.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async list(filter: {
    active?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: Tariff[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.TariffWhereInput = {};
    if (typeof filter.active === 'boolean') where.isActive = filter.active;

    const [items, total] = await Promise.all([
      this.prisma.tariff.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tariff.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findUserTariff(
    userId: string,
    tx?: PrismaTx,
  ): Promise<(UserTariff & { tariff: Tariff }) | null> {
    const client = tx ?? this.prisma;
    return client.userTariff.findUnique({
      where: { userId },
      include: { tariff: true },
    });
  }

  /**
   * Resolve the user's effective Tariff: assigned UserTariff if any (and tariff active),
   * else the default Tariff.
   */
  async getEffectiveTariffForUser(userId: string, tx?: PrismaTx): Promise<Tariff> {
    const ut = await this.findUserTariff(userId, tx);
    if (ut && ut.tariff.isActive) return ut.tariff;
    return this.getDefault(tx);
  }

  async listBundlePrices(tariffId: string): Promise<TariffBundlePrice[]> {
    return this.prisma.tariffBundlePrice.findMany({
      where: { tariffId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findBundlePrice(
    tariffId: string,
    bundleId: string,
    tx?: PrismaTx,
  ): Promise<TariffBundlePrice | null> {
    const client = tx ?? this.prisma;
    return client.tariffBundlePrice.findUnique({
      where: { tariffId_bundleId: { tariffId, bundleId } },
    });
  }
}
