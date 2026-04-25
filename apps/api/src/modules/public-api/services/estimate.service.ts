import { Injectable } from '@nestjs/common';
import { BundleUnit } from '@aiagg/db';
import { CatalogService } from '../../catalog/catalog.service';
import { BundleSpecService } from '../../catalog/bundle-spec.service';
import { PricingService } from '../../pricing/pricing.service';
import { CouponsService } from '../../coupons/coupons.service';
import { BillingService } from '../../billing/billing.service';
import type { EstimateDto } from '../dto/estimate.dto';
import type { AuthContext, EstimateResultView } from '../dto/views';

interface PriceCompute {
  basePriceUnits: bigint;
  priceType: string;
}

@Injectable()
export class EstimateService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly bundleSpec: BundleSpecService,
    private readonly pricing: PricingService,
    private readonly coupons: CouponsService,
    private readonly billing: BillingService,
  ) {}

  async estimate(input: {
    auth: AuthContext;
    body: EstimateDto;
  }): Promise<EstimateResultView> {
    const { auth, body } = input;
    const userId = auth.user.id;

    const triple = await this.catalog.resolveAndCheck(
      body.provider,
      body.model,
      body.method,
      userId,
    );
    const params = (body.params ?? {}) as Record<string, unknown>;
    this.catalog.validateParamsOrThrow(triple.method, params);

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
      persistSnapshot: false,
    });

    const compute = this.computePrice(bundle.unit, resolved.components, params);
    const basePriceUnits = compute.basePriceUnits;

    let discountUnits = 0n;
    if (body.coupon) {
      const preview = await this.coupons.previewRequestDiscount({
        code: body.coupon,
        userId,
        methodCode: triple.method.code,
        bundleId: bundle.id,
        basePriceUnits,
      });
      if (preview) discountUnits = preview.discountUnits;
    }
    const clientPriceUnits =
      basePriceUnits > discountUnits ? basePriceUnits - discountUnits : 0n;

    const balances = await this.billing.getBalances(userId);
    const enough = balances.available >= clientPriceUnits;

    return {
      success: true,
      provider: triple.provider.code,
      model: triple.model.code,
      method: triple.method.code,
      pricing: {
        price_type: compute.priceType,
        final_price: clientPriceUnits,
        discount: discountUnits,
        reserved_amount: clientPriceUnits,
        currency: resolved.currency,
        pricing_rule_id: resolved.sourceRefId,
        bundle_key: bundle.bundleKey,
        components: resolved.components,
      },
      balance: {
        available: balances.available,
        reserved: balances.reserved,
        enough_balance: enough,
        currency: balances.currency,
      },
    };
  }

  /**
   * Compute base price from components per BundleUnit. PER_REQUEST also
   * multiplies by params.imagesCount/videosCount when present (capped at a
   * sane value) for cost-of-multi-output methods. PER_TOKEN_* paths fall back
   * to basePriceUnits and are refined post-call in later stages.
   */
  computePrice(
    unit: BundleUnit,
    components: {
      basePriceUnits: bigint | null;
      perSecondUnits: bigint | null;
      perImageUnits: bigint | null;
    },
    params: Record<string, unknown>,
  ): PriceCompute {
    const imagesCount = this.intParam(params, ['imagesCount', 'images_count', 'n'], 1);
    const videosCount = this.intParam(params, ['videosCount', 'videos_count'], 1);
    const duration = this.intParam(
      params,
      ['durationSeconds', 'duration_seconds', 'duration'],
      0,
    );

    switch (unit) {
      case BundleUnit.PER_REQUEST: {
        const base = components.basePriceUnits ?? 0n;
        const multiplier = BigInt(Math.max(1, imagesCount * videosCount));
        return { basePriceUnits: base * multiplier, priceType: 'per_request' };
      }
      case BundleUnit.PER_SECOND: {
        const ps = components.perSecondUnits ?? 0n;
        const seconds = BigInt(Math.max(0, duration));
        const vcount = BigInt(Math.max(1, videosCount));
        return { basePriceUnits: ps * seconds * vcount, priceType: 'per_second' };
      }
      case BundleUnit.PER_IMAGE: {
        const pi = components.perImageUnits ?? 0n;
        return {
          basePriceUnits: pi * BigInt(Math.max(1, imagesCount)),
          priceType: 'per_image',
        };
      }
      case BundleUnit.PER_TOKEN_INPUT:
      case BundleUnit.PER_TOKEN_OUTPUT:
      default:
        return {
          basePriceUnits: components.basePriceUnits ?? 0n,
          priceType: unit.toLowerCase(),
        };
    }
  }

  private intParam(
    params: Record<string, unknown>,
    keys: string[],
    fallback: number,
  ): number {
    for (const k of keys) {
      const v = params[k];
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
      if (typeof v === 'string' && /^\d+$/.test(v)) return Number.parseInt(v, 10);
    }
    return fallback;
  }
}
