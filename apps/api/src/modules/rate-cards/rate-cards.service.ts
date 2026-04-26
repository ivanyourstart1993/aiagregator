// Stage 12 — Provider rate cards. Resolves provider's actual cost for a given
// (provider, model, method, dimensions) tuple by selecting the best-matching
// active ProviderRateCard. Cost is later compared against captured revenue
// to compute margin.
import { Injectable, Logger } from '@nestjs/common';
import {
  type ProviderRateCard,
  RateCardPriceType,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RateCardDimensions {
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  imagesCount?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface RateCardCostResult {
  providerCostUnits: bigint;
  source: 'rate_card' | 'fallback';
  rateCardId?: string;
}

@Injectable()
export class RateCardService {
  private readonly logger = new Logger(RateCardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the best-matching ProviderRateCard for the given parameters.
   * Matching priority (most specific → least specific):
   *   1. provider+model+method+mode+resolution+...
   *   2. provider+model+method
   *   3. provider+method (modelId IS NULL)
   *   4. provider only (model IS NULL, method IS NULL)
   */
  async getCost(
    providerId: string,
    modelId: string | null,
    methodId: string | null,
    dimensions: RateCardDimensions,
  ): Promise<RateCardCostResult> {
    const now = new Date();
    const candidates = await this.prisma.providerRateCard.findMany({
      where: {
        providerId,
        status: 'ACTIVE',
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    if (candidates.length === 0) {
      return { providerCostUnits: 0n, source: 'fallback' };
    }
    const ranked = candidates
      .map((c) => ({ card: c, score: this.scoreCard(c, modelId, methodId, dimensions) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) {
      return { providerCostUnits: 0n, source: 'fallback' };
    }
    const best = ranked[0]!.card;
    const cost = this.computeCost(best, dimensions);
    return { providerCostUnits: cost, source: 'rate_card', rateCardId: best.id };
  }

  /**
   * Update the providerCostUnits on a ProviderAttempt row.
   */
  async recordAttemptCost(attemptId: string, units: bigint): Promise<void> {
    await this.prisma.providerAttempt.update({
      where: { id: attemptId },
      data: { providerCostUnits: units },
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private scoreCard(
    card: ProviderRateCard,
    modelId: string | null,
    methodId: string | null,
    d: RateCardDimensions,
  ): number {
    let score = 0;
    // Disqualifying mismatches
    if (card.modelId && card.modelId !== modelId) return -1;
    if (card.methodId && card.methodId !== methodId) return -1;
    if (card.mode && card.mode !== (d.mode ?? null)) return -1;
    if (card.resolution && card.resolution !== (d.resolution ?? null)) return -1;
    if (
      card.durationSeconds != null &&
      card.durationSeconds !== (d.durationSeconds ?? null)
    ) {
      return -1;
    }
    if (card.aspectRatio && card.aspectRatio !== (d.aspectRatio ?? null)) return -1;

    if (card.modelId) score += 8;
    if (card.methodId) score += 4;
    if (card.mode) score += 2;
    if (card.resolution) score += 2;
    if (card.durationSeconds != null) score += 1;
    if (card.aspectRatio) score += 1;
    return score;
  }

  private computeCost(card: ProviderRateCard, d: RateCardDimensions): bigint {
    switch (card.priceType) {
      case RateCardPriceType.PER_REQUEST:
        return card.providerCostUnits ?? 0n;
      case RateCardPriceType.PER_SECOND: {
        const secs = BigInt(d.durationSeconds ?? 0);
        return (card.pricePerSecond ?? 0n) * secs;
      }
      case RateCardPriceType.PER_IMAGE: {
        const n = BigInt(d.imagesCount ?? 1);
        return (card.pricePerImage ?? 0n) * n;
      }
      case RateCardPriceType.PER_TOKEN_INPUT: {
        const n = BigInt(d.inputTokens ?? 0);
        return (card.pricePerTokenInput ?? card.providerUnitCost ?? 0n) * n;
      }
      case RateCardPriceType.PER_TOKEN_OUTPUT: {
        const n = BigInt(d.outputTokens ?? 0);
        return (card.pricePerTokenOutput ?? card.providerUnitCost ?? 0n) * n;
      }
      case RateCardPriceType.CUSTOM:
      default:
        return card.providerCostUnits ?? 0n;
    }
  }
}
