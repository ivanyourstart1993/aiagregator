// Stage 12 — admin analytics. Aggregates revenue (captured transactions),
// provider cost (ProviderAttempt.providerCostUnits), margin, top users,
// top methods, per-bundle stats. All money in nano-USD bigint.
import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AnalyticsFilter {
  from: Date;
  to: Date;
  providerId?: string;
  modelId?: string;
  methodId?: string;
}

export interface RevenueResult {
  revenueUnits: bigint;
  requestCount: number;
}

export interface ProviderCostResult {
  costUnits: bigint;
  requestCount: number;
}

export interface MarginResult {
  revenueUnits: bigint;
  costUnits: bigint;
  marginUnits: bigint;
  marginPercent: number;
  // Coupon-credits redeemed in the period (FIXED_AMOUNT + BONUS_MONEY + DISCOUNT_TOPUP).
  // These credits inflate gross revenue but represent no real cash inflow.
  couponCreditsUnits: bigint;
  // revenueUnits − couponCreditsUnits. Best-effort proxy for "real" cash revenue
  // when lot-level wallet accounting is unavailable.
  cashRevenueUnits: bigint;
  cashMarginUnits: bigint;
  cashMarginPercent: number;
}

export interface CouponCreditsResult {
  creditUnits: bigint;
  redemptionCount: number;
}

export interface DailyRevenueRow {
  date: string;
  revenueUnits: bigint;
  requestCount: number;
}

export interface CostByProviderRow {
  providerId: string;
  providerCode: string;
  costUnits: bigint;
  requestCount: number;
}

export interface TopUserRow {
  userId: string;
  email: string | null;
  spendUnits: bigint;
  requestCount: number;
}

export interface TopMethodRow {
  methodId: string;
  providerCode: string;
  modelCode: string;
  methodCode: string;
  requestCount: number;
  revenueUnits: bigint;
}

export interface BundleStatsRow {
  providerCode: string;
  modelCode: string;
  methodCode: string;
  resolution: string | null;
  requestCount: number;
  revenueUnits: bigint;
  providerCostUnits: bigint;
  marginUnits: bigint;
  errorRate: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Top-level summary metrics
  // ---------------------------------------------------------------------------

  async getRevenue(filter: AnalyticsFilter): Promise<RevenueResult> {
    const where: Prisma.TransactionWhereInput = {
      type: TransactionType.RESERVATION_CAPTURE,
      createdAt: { gte: filter.from, lte: filter.to },
    };
    if (filter.methodId || filter.modelId || filter.providerId) {
      // Capture transactions reference taskId; join through Task → Method.
      where.taskId = { not: null };
    }
    const txs = await this.prisma.transaction.findMany({
      where,
      select: { amountUnits: true, taskId: true },
    });
    let filtered = txs;
    if (filter.methodId || filter.modelId || filter.providerId) {
      const taskIds = txs.map((t) => t.taskId).filter((x): x is string => !!x);
      const tasks = await this.prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, methodId: true },
      });
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      let allowedMethodIds: Set<string> | null = null;
      if (filter.methodId) {
        allowedMethodIds = new Set([filter.methodId]);
      } else if (filter.modelId || filter.providerId) {
        const methods = await this.prisma.method.findMany({
          where: {
            ...(filter.modelId ? { modelId: filter.modelId } : {}),
            ...(filter.providerId ? { providerId: filter.providerId } : {}),
          },
          select: { id: true },
        });
        allowedMethodIds = new Set(methods.map((m) => m.id));
      }
      filtered = txs.filter((t) => {
        if (!t.taskId) return false;
        const task = taskById.get(t.taskId);
        if (!task) return false;
        return allowedMethodIds!.has(task.methodId);
      });
    }
    let revenueUnits = 0n;
    for (const t of filtered) {
      // capture amounts are stored as negative; revenue is the absolute value
      revenueUnits += t.amountUnits < 0n ? -t.amountUnits : t.amountUnits;
    }
    return { revenueUnits, requestCount: filtered.length };
  }

  async getProviderCost(filter: AnalyticsFilter): Promise<ProviderCostResult> {
    const where: Prisma.ProviderAttemptWhereInput = {
      status: 'success',
      finishedAt: { gte: filter.from, lte: filter.to },
      providerCostUnits: { not: null },
    };
    if (filter.providerId) where.providerId = filter.providerId;
    const attempts = await this.prisma.providerAttempt.findMany({
      where,
      select: { providerCostUnits: true, taskId: true },
    });
    let filtered = attempts;
    if (filter.modelId || filter.methodId) {
      const taskIds = attempts.map((a) => a.taskId);
      const tasks = await this.prisma.task.findMany({
        where: {
          id: { in: taskIds },
          ...(filter.methodId ? { methodId: filter.methodId } : {}),
          ...(filter.modelId
            ? { method: { modelId: filter.modelId } }
            : {}),
        },
        select: { id: true },
      });
      const allowed = new Set(tasks.map((t) => t.id));
      filtered = attempts.filter((a) => allowed.has(a.taskId));
    }
    let costUnits = 0n;
    for (const a of filtered) costUnits += a.providerCostUnits ?? 0n;
    return { costUnits, requestCount: filtered.length };
  }

  async getMargin(filter: AnalyticsFilter): Promise<MarginResult> {
    const [rev, cost, credits] = await Promise.all([
      this.getRevenue(filter),
      this.getProviderCost(filter),
      this.getCouponCredits(filter),
    ]);
    const marginUnits = rev.revenueUnits - cost.costUnits;
    const marginPercent =
      rev.revenueUnits > 0n
        ? Number((marginUnits * 10000n) / rev.revenueUnits) / 100
        : 0;
    const cashRevenueUnits = rev.revenueUnits - credits.creditUnits;
    const cashMarginUnits = cashRevenueUnits - cost.costUnits;
    const cashMarginPercent =
      cashRevenueUnits > 0n
        ? Number((cashMarginUnits * 10000n) / cashRevenueUnits) / 100
        : 0;
    return {
      revenueUnits: rev.revenueUnits,
      costUnits: cost.costUnits,
      marginUnits,
      marginPercent,
      couponCreditsUnits: credits.creditUnits,
      cashRevenueUnits,
      cashMarginUnits,
      cashMarginPercent,
    };
  }

  /**
   * Sum of coupon-funded credits added to user wallets in the period.
   *
   * Includes coupons whose effect is to grant balance:
   *   - FIXED_AMOUNT (standalone redemption credits N nano-USD)
   *   - BONUS_MONEY (standalone bonus credit)
   *   - DISCOUNT_TOPUP (bonus added on top of a paid deposit)
   *
   * Excludes:
   *   - DISCOUNT_METHOD_PERCENT, DISCOUNT_BUNDLE_AMOUNT — these reduce the capture
   *     amount directly so the discounted portion is already not in revenue.
   */
  async getCouponCredits(filter: AnalyticsFilter): Promise<CouponCreditsResult> {
    const rows = await this.prisma.$queryRaw<
      Array<{ total: bigint | null; cnt: bigint }>
    >`
      SELECT SUM(cr."amountUnits") AS total,
             COUNT(*)::bigint AS cnt
      FROM "coupon_redemption" cr
      JOIN "coupon" c ON c."id" = cr."couponId"
      WHERE cr."createdAt" >= ${filter.from}
        AND cr."createdAt" <= ${filter.to}
        AND c."type" IN ('FIXED_AMOUNT', 'BONUS_MONEY', 'DISCOUNT_TOPUP')
    `;
    const row = rows[0];
    return {
      creditUnits: row?.total ?? 0n,
      redemptionCount: row ? Number(row.cnt) : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Time-series & breakdowns
  // ---------------------------------------------------------------------------

  async getRevenueByDay(filter: AnalyticsFilter): Promise<DailyRevenueRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ d: Date; revenue: bigint | null; cnt: bigint }>
    >`
      SELECT date_trunc('day', "createdAt") AS d,
             SUM(ABS("amountUnits")) AS revenue,
             COUNT(*)::bigint AS cnt
      FROM "transaction"
      WHERE "type" = 'RESERVATION_CAPTURE'
        AND "createdAt" >= ${filter.from}
        AND "createdAt" <= ${filter.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map((r) => ({
      date: r.d.toISOString().slice(0, 10),
      revenueUnits: r.revenue ?? 0n,
      requestCount: Number(r.cnt),
    }));
  }

  async getCostByProvider(filter: AnalyticsFilter): Promise<CostByProviderRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        providerId: string;
        code: string;
        cost: bigint | null;
        cnt: bigint;
      }>
    >`
      SELECT pa."providerId" AS "providerId",
             p."code" AS code,
             SUM(pa."providerCostUnits") AS cost,
             COUNT(*)::bigint AS cnt
      FROM "provider_attempt" pa
      JOIN "provider" p ON p."id" = pa."providerId"
      WHERE pa."status" = 'success'
        AND pa."finishedAt" >= ${filter.from}
        AND pa."finishedAt" <= ${filter.to}
        AND pa."providerCostUnits" IS NOT NULL
      GROUP BY pa."providerId", p."code"
      ORDER BY cost DESC NULLS LAST
    `;
    return rows.map((r) => ({
      providerId: r.providerId,
      providerCode: r.code,
      costUnits: r.cost ?? 0n,
      requestCount: Number(r.cnt),
    }));
  }

  async getTopUsers(filter: AnalyticsFilter, limit = 10): Promise<TopUserRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ userId: string; email: string | null; spend: bigint | null; cnt: bigint }>
    >`
      SELECT t."userId" AS "userId",
             u."email" AS email,
             SUM(ABS(t."amountUnits")) AS spend,
             COUNT(*)::bigint AS cnt
      FROM "transaction" t
      JOIN "user" u ON u."id" = t."userId"
      WHERE t."type" = 'RESERVATION_CAPTURE'
        AND t."createdAt" >= ${filter.from}
        AND t."createdAt" <= ${filter.to}
      GROUP BY t."userId", u."email"
      ORDER BY spend DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      spendUnits: r.spend ?? 0n,
      requestCount: Number(r.cnt),
    }));
  }

  async getTopMethods(
    filter: AnalyticsFilter,
    limit = 10,
  ): Promise<TopMethodRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        methodId: string;
        providerCode: string;
        modelCode: string;
        methodCode: string;
        cnt: bigint;
        revenue: bigint | null;
      }>
    >`
      SELECT m."id" AS "methodId",
             p."code" AS "providerCode",
             mo."code" AS "modelCode",
             m."code" AS "methodCode",
             COUNT(*)::bigint AS cnt,
             SUM(ABS(t."amountUnits")) AS revenue
      FROM "transaction" t
      JOIN "task" tk ON tk."id" = t."taskId"
      JOIN "method" m ON m."id" = tk."methodId"
      JOIN "provider" p ON p."id" = m."providerId"
      JOIN "model" mo ON mo."id" = m."modelId"
      WHERE t."type" = 'RESERVATION_CAPTURE'
        AND t."createdAt" >= ${filter.from}
        AND t."createdAt" <= ${filter.to}
      GROUP BY m."id", p."code", mo."code", m."code"
      ORDER BY cnt DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      methodId: r.methodId,
      providerCode: r.providerCode,
      modelCode: r.modelCode,
      methodCode: r.methodCode,
      requestCount: Number(r.cnt),
      revenueUnits: r.revenue ?? 0n,
    }));
  }

  async getPerBundleStats(filter: AnalyticsFilter): Promise<BundleStatsRow[]> {
    // Aggregate per-method+resolution (resolution comes from Bundle via bundleKey on transaction)
    const rows = await this.prisma.$queryRaw<
      Array<{
        providerCode: string;
        modelCode: string;
        methodCode: string;
        resolution: string | null;
        cnt: bigint;
        revenue: bigint | null;
        cost: bigint | null;
        errors: bigint;
        total: bigint;
      }>
    >`
      WITH cap AS (
        SELECT t."taskId", b."providerSlug", b."modelSlug", m."code" AS "methodCode",
               b."resolution", t."amountUnits"
        FROM "transaction" t
        JOIN "task" tk ON tk."id" = t."taskId"
        JOIN "method" m ON m."id" = tk."methodId"
        JOIN "bundle" b ON b."bundleKey" = t."bundleKey"
        WHERE t."type" = 'RESERVATION_CAPTURE'
          AND t."createdAt" >= ${filter.from}
          AND t."createdAt" <= ${filter.to}
      ),
      attempts AS (
        SELECT pa."taskId", SUM(pa."providerCostUnits") AS cost,
               COUNT(*) FILTER (WHERE pa."status" = 'failed')::bigint AS errors,
               COUNT(*)::bigint AS total
        FROM "provider_attempt" pa
        WHERE pa."finishedAt" >= ${filter.from}
          AND pa."finishedAt" <= ${filter.to}
        GROUP BY pa."taskId"
      )
      SELECT cap."providerSlug" AS "providerCode",
             cap."modelSlug" AS "modelCode",
             cap."methodCode" AS "methodCode",
             cap."resolution" AS resolution,
             COUNT(*)::bigint AS cnt,
             SUM(ABS(cap."amountUnits")) AS revenue,
             SUM(a.cost) AS cost,
             COALESCE(SUM(a.errors), 0)::bigint AS errors,
             COALESCE(SUM(a.total), 0)::bigint AS total
      FROM cap
      LEFT JOIN attempts a ON a."taskId" = cap."taskId"
      GROUP BY cap."providerSlug", cap."modelSlug", cap."methodCode", cap."resolution"
      ORDER BY revenue DESC NULLS LAST
    `;
    return rows.map((r) => {
      const revenue = r.revenue ?? 0n;
      const cost = r.cost ?? 0n;
      const totalAttempts = Number(r.total);
      const errorAttempts = Number(r.errors);
      return {
        providerCode: r.providerCode,
        modelCode: r.modelCode,
        methodCode: r.methodCode,
        resolution: r.resolution,
        requestCount: Number(r.cnt),
        revenueUnits: revenue,
        providerCostUnits: cost,
        marginUnits: revenue - cost,
        errorRate: totalAttempts > 0 ? errorAttempts / totalAttempts : 0,
      };
    });
  }
}
