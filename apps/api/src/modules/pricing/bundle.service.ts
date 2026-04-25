import { Injectable } from '@nestjs/common';
import {
  type Bundle,
  type BundleMethod,
  BundleUnit,
  Prisma,
} from '@aiagg/db';
import { type BundleSpec, buildBundleKey } from '@aiagg/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import { BundleNotFoundError } from '../../common/errors/pricing.errors';
import type { BundleView } from './dto/views';

export interface EnsureBundleSpec extends BundleSpec {
  method: BundleMethod;
  unit?: BundleUnit;
}

@Injectable()
export class BundleService {
  constructor(private readonly prisma: PrismaService) {}

  toView(b: Bundle): BundleView {
    return {
      id: b.id,
      providerSlug: b.providerSlug,
      modelSlug: b.modelSlug,
      method: b.method,
      mode: b.mode,
      resolution: b.resolution,
      durationSeconds: b.durationSeconds,
      aspectRatio: b.aspectRatio,
      bundleKey: b.bundleKey,
      unit: b.unit,
      isActive: b.isActive,
    };
  }

  /**
   * Idempotently fetch or create a Bundle row keyed by canonical bundleKey.
   * Optionally runs inside an existing transaction.
   */
  async ensureBundle(spec: EnsureBundleSpec, tx?: PrismaTx): Promise<Bundle> {
    const bundleKey = buildBundleKey({
      providerSlug: spec.providerSlug,
      modelSlug: spec.modelSlug,
      method: spec.method,
      mode: spec.mode ?? null,
      resolution: spec.resolution ?? null,
      durationSeconds: spec.durationSeconds ?? null,
      aspectRatio: spec.aspectRatio ?? null,
    });

    const client = tx ?? this.prisma;
    return client.bundle.upsert({
      where: { bundleKey },
      update: {},
      create: {
        bundleKey,
        providerSlug: spec.providerSlug.toLowerCase().trim(),
        modelSlug: spec.modelSlug.toLowerCase().trim(),
        method: spec.method,
        mode: spec.mode ?? null,
        resolution: spec.resolution ?? null,
        durationSeconds: spec.durationSeconds ?? null,
        aspectRatio: spec.aspectRatio ?? null,
        unit: spec.unit ?? BundleUnit.PER_REQUEST,
      },
    });
  }

  async findById(id: string): Promise<Bundle | null> {
    return this.prisma.bundle.findUnique({ where: { id } });
  }

  async findByKey(bundleKey: string): Promise<Bundle | null> {
    return this.prisma.bundle.findUnique({ where: { bundleKey } });
  }

  async getById(id: string): Promise<Bundle> {
    const b = await this.findById(id);
    if (!b) throw new BundleNotFoundError(id);
    return b;
  }

  async getByKey(bundleKey: string): Promise<Bundle> {
    const b = await this.findByKey(bundleKey);
    if (!b) throw new BundleNotFoundError(bundleKey);
    return b;
  }

  async list(filter: {
    provider?: string;
    model?: string;
    method?: BundleMethod;
    active?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: Bundle[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.BundleWhereInput = {};
    if (filter.provider) where.providerSlug = filter.provider.toLowerCase();
    if (filter.model) where.modelSlug = filter.model.toLowerCase();
    if (filter.method) where.method = filter.method;
    if (typeof filter.active === 'boolean') where.isActive = filter.active;

    const [items, total] = await Promise.all([
      this.prisma.bundle.findMany({
        where,
        orderBy: [{ providerSlug: 'asc' }, { modelSlug: 'asc' }, { method: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bundle.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async updateBundle(
    id: string,
    data: { isActive?: boolean; unit?: BundleUnit },
  ): Promise<Bundle> {
    await this.getById(id);
    return this.prisma.bundle.update({ where: { id }, data });
  }
}
