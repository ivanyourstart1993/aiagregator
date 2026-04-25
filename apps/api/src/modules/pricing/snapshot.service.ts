import { Injectable } from '@nestjs/common';
import {
  Currency,
  type PriceSource,
  type PricingSnapshot,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import type { PriceComponentsView } from './dto/views';

export interface SnapshotInput {
  userId: string;
  bundleId: string;
  bundleKey: string;
  source: PriceSource;
  sourceRefId: string;
  currency?: Currency;
  components: PriceComponentsView;
}

@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: SnapshotInput, tx?: PrismaTx): Promise<PricingSnapshot> {
    const client = tx ?? this.prisma;
    return client.pricingSnapshot.create({
      data: {
        userId: input.userId,
        bundleId: input.bundleId,
        bundleKey: input.bundleKey,
        source: input.source,
        sourceRefId: input.sourceRefId,
        currency: input.currency ?? Currency.USD,
        basePriceUnits: input.components.basePriceUnits,
        inputPerTokenUnits: input.components.inputPerTokenUnits,
        outputPerTokenUnits: input.components.outputPerTokenUnits,
        perSecondUnits: input.components.perSecondUnits,
        perImageUnits: input.components.perImageUnits,
      },
    });
  }

  async findById(id: string): Promise<PricingSnapshot | null> {
    return this.prisma.pricingSnapshot.findUnique({ where: { id } });
  }
}
