import { Injectable } from '@nestjs/common';
import {
  type Bundle,
  Currency,
  PriceSource,
  type Tariff,
  type TariffBundlePrice,
  type UserBundlePrice,
} from '@aiagg/db';
import type { BundleSpec } from '@aiagg/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import { PriceNotConfiguredError } from '../../common/errors/pricing.errors';
import { BundleService, type EnsureBundleSpec } from './bundle.service';
import { SnapshotService } from './snapshot.service';
import { TariffService } from './tariff.service';
import { PricingCacheService } from './pricing-cache.service';
import type {
  EffectivePriceView,
  PriceComponentsView,
  ResolvedPriceView,
} from './dto/views';

export interface ResolvePriceInput {
  userId: string;
  bundleSpec: EnsureBundleSpec;
  persistSnapshot?: boolean;
  tx?: PrismaTx;
}

interface ComponentSourceRow {
  basePriceUnits: bigint | null;
  inputPerTokenUnits: bigint | null;
  outputPerTokenUnits: bigint | null;
  perSecondUnits: bigint | null;
  perImageUnits: bigint | null;
}

function pickComponents(row: ComponentSourceRow): PriceComponentsView {
  return {
    basePriceUnits: row.basePriceUnits ?? null,
    inputPerTokenUnits: row.inputPerTokenUnits ?? null,
    outputPerTokenUnits: row.outputPerTokenUnits ?? null,
    perSecondUnits: row.perSecondUnits ?? null,
    perImageUnits: row.perImageUnits ?? null,
  };
}

function isEmpty(c: PriceComponentsView): boolean {
  return (
    c.basePriceUnits === null &&
    c.inputPerTokenUnits === null &&
    c.outputPerTokenUnits === null &&
    c.perSecondUnits === null &&
    c.perImageUnits === null
  );
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundles: BundleService,
    private readonly tariffs: TariffService,
    private readonly snapshots: SnapshotService,
    private readonly cache: PricingCacheService,
  ) {}

  /**
   * Resolve a price for (userId, bundleSpec) following:
   *   USER_BUNDLE_OVERRIDE → USER_TARIFF → DEFAULT_TARIFF
   *
   * If `persistSnapshot=true`, an immutable PricingSnapshot row is written and
   * its id is returned in `pricingSnapshotId`. Cache is bypassed in that case
   * because callers need the freshly inserted snapshot id.
   */
  async resolvePrice(input: ResolvePriceInput): Promise<ResolvedPriceView> {
    const tx = input.tx;
    const bundle = await this.bundles.ensureBundle(input.bundleSpec, tx);

    if (!input.persistSnapshot && !tx) {
      const cached = await this.cache.get(input.userId, bundle.bundleKey);
      if (cached) return cached;
    }

    const resolved = await this.resolveComponents(input.userId, bundle, tx);

    const view: Omit<ResolvedPriceView, 'pricingSnapshotId'> = {
      source: resolved.source,
      sourceRefId: resolved.sourceRefId,
      currency: resolved.currency,
      components: resolved.components,
      bundle: this.bundles.toView(bundle),
    };

    if (input.persistSnapshot) {
      const snap = await this.snapshots.create(
        {
          userId: input.userId,
          bundleId: bundle.id,
          bundleKey: bundle.bundleKey,
          source: resolved.source,
          sourceRefId: resolved.sourceRefId,
          currency: resolved.currency,
          components: resolved.components,
        },
        tx,
      );
      return { ...view, pricingSnapshotId: snap.id };
    }

    if (!tx) {
      await this.cache.set(input.userId, bundle.bundleKey, view);
    }
    return view;
  }

  /**
   * Pure preview for a known bundle id — no snapshot, no admit-side effects.
   * Returns null if pricing is not configured for the user/bundle pair.
   */
  async previewPrice(
    userId: string,
    bundleId: string,
  ): Promise<EffectivePriceView | null> {
    const bundle = await this.bundles.findById(bundleId);
    if (!bundle) return null;
    return this.previewForBundle(userId, bundle);
  }

  async previewByBundleKey(
    userId: string,
    bundleKey: string,
  ): Promise<EffectivePriceView | null> {
    const bundle = await this.bundles.findByKey(bundleKey);
    if (!bundle) return null;
    return this.previewForBundle(userId, bundle);
  }

  private async previewForBundle(
    userId: string,
    bundle: Bundle,
  ): Promise<EffectivePriceView | null> {
    try {
      const r = await this.resolveComponents(userId, bundle);
      return {
        bundle: this.bundles.toView(bundle),
        source: r.source,
        sourceRefId: r.sourceRefId,
        currency: r.currency,
        components: r.components,
        marginBps: r.marginBps ?? null,
        providerCostUnits: r.providerCostUnits ?? null,
      };
    } catch (err) {
      if (err instanceof PriceNotConfiguredError) return null;
      throw err;
    }
  }

  /**
   * For the user's effective tariff + their UserBundlePrice overrides, return
   * one EffectivePriceView per Bundle that has any pricing configured.
   */
  async previewAllForUser(
    userId: string,
    filter: {
      provider?: string;
      model?: string;
      method?: string;
    } = {},
  ): Promise<EffectivePriceView[]> {
    const userTariff = await this.tariffs.findUserTariff(userId);
    let effectiveTariff: Tariff | null = userTariff?.tariff?.isActive
      ? userTariff.tariff
      : null;
    if (!effectiveTariff) {
      effectiveTariff = await this.tariffs.findDefault();
    }

    const overrides = await this.prisma.userBundlePrice.findMany({
      where: { userId },
      include: { bundle: true },
    });

    const tariffPrices: (TariffBundlePrice & { bundle: Bundle })[] = effectiveTariff
      ? await this.prisma.tariffBundlePrice.findMany({
          where: { tariffId: effectiveTariff.id },
          include: { bundle: true },
        })
      : [];

    const overrideByBundleId = new Map<string, UserBundlePrice & { bundle: Bundle }>();
    for (const o of overrides) overrideByBundleId.set(o.bundleId, o);

    const seen = new Set<string>();
    const out: EffectivePriceView[] = [];

    const matches = (b: Bundle): boolean => {
      if (filter.provider && b.providerSlug !== filter.provider.toLowerCase()) return false;
      if (filter.model && b.modelSlug !== filter.model.toLowerCase()) return false;
      if (filter.method && b.method !== filter.method) return false;
      return b.isActive;
    };

    for (const o of overrides) {
      if (!matches(o.bundle)) continue;
      const components = pickComponents(o);
      if (isEmpty(components)) continue;
      out.push({
        bundle: this.bundles.toView(o.bundle),
        source: PriceSource.USER_BUNDLE_OVERRIDE,
        sourceRefId: o.id,
        currency: o.currency,
        components,
      });
      seen.add(o.bundleId);
    }

    if (effectiveTariff) {
      const isUserAssigned = !!userTariff && userTariff.tariff.isActive;
      const source = isUserAssigned ? PriceSource.USER_TARIFF : PriceSource.DEFAULT_TARIFF;
      for (const p of tariffPrices) {
        if (seen.has(p.bundleId)) continue;
        if (!matches(p.bundle)) continue;
        const components = pickComponents(p);
        if (isEmpty(components)) continue;
        out.push({
          bundle: this.bundles.toView(p.bundle),
          source,
          sourceRefId: effectiveTariff.id,
          currency: p.currency,
          components,
          marginBps: p.marginBps,
          providerCostUnits: p.providerCostUnits,
        });
        seen.add(p.bundleId);
      }
    }

    return out;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async resolveComponents(
    userId: string,
    bundle: Bundle,
    tx?: PrismaTx,
  ): Promise<{
    source: PriceSource;
    sourceRefId: string;
    currency: Currency;
    components: PriceComponentsView;
    marginBps?: number | null;
    providerCostUnits?: bigint | null;
  }> {
    const client = tx ?? this.prisma;

    // 1. UserBundlePrice
    const ubp = await client.userBundlePrice.findUnique({
      where: { userId_bundleId: { userId, bundleId: bundle.id } },
    });
    if (ubp) {
      const components = pickComponents(ubp);
      if (!isEmpty(components)) {
        return {
          source: PriceSource.USER_BUNDLE_OVERRIDE,
          sourceRefId: ubp.id,
          currency: ubp.currency,
          components,
        };
      }
    }

    // 2. UserTariff
    const userTariff = await client.userTariff.findUnique({
      where: { userId },
      include: { tariff: true },
    });
    if (userTariff && userTariff.tariff.isActive) {
      const tbp = await client.tariffBundlePrice.findUnique({
        where: { tariffId_bundleId: { tariffId: userTariff.tariffId, bundleId: bundle.id } },
      });
      if (tbp) {
        const components = pickComponents(tbp);
        if (!isEmpty(components)) {
          return {
            source: PriceSource.USER_TARIFF,
            sourceRefId: userTariff.tariffId,
            currency: tbp.currency,
            components,
            marginBps: tbp.marginBps,
            providerCostUnits: tbp.providerCostUnits,
          };
        }
      }
    }

    // 3. Default Tariff
    const defaultTariff = await client.tariff.findFirst({ where: { isDefault: true } });
    if (defaultTariff) {
      const tbp = await client.tariffBundlePrice.findUnique({
        where: { tariffId_bundleId: { tariffId: defaultTariff.id, bundleId: bundle.id } },
      });
      if (tbp) {
        const components = pickComponents(tbp);
        if (!isEmpty(components)) {
          return {
            source: PriceSource.DEFAULT_TARIFF,
            sourceRefId: defaultTariff.id,
            currency: tbp.currency,
            components,
            marginBps: tbp.marginBps,
            providerCostUnits: tbp.providerCostUnits,
          };
        }
      }
    }

    throw new PriceNotConfiguredError(bundle.bundleKey);
  }

  // Convenience: kept for callers that pass a raw shared BundleSpec.
  static toEnsureSpec(spec: BundleSpec): EnsureBundleSpec {
    // The caller is responsible for passing a BundleMethod string compatible
    // with the enum; this helper exists for future migrations.
    return spec as EnsureBundleSpec;
  }
}
