import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AnalyticsService,
  type AnalyticsFilter,
  type BundleStatsRow,
  type CostByProviderRow,
  type DailyRevenueRow,
  type TopMethodRow,
  type TopUserRow,
} from './analytics.service';

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`invalid date: ${s}`);
  }
  return d;
}

function buildFilter(
  from: string | undefined,
  to: string | undefined,
  providerId?: string,
  modelId?: string,
  methodId?: string,
): AnalyticsFilter {
  const now = new Date();
  const defFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: parseDate(from, defFrom),
    to: parseDate(to, now),
    providerId,
    modelId,
    methodId,
  };
}

@Controller('internal/admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  async summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('providerId') providerId?: string,
    @Query('modelId') modelId?: string,
    @Query('methodId') methodId?: string,
  ) {
    const filter = buildFilter(from, to, providerId, modelId, methodId);
    const margin = await this.analytics.getMargin(filter);
    return {
      from: filter.from.toISOString(),
      to: filter.to.toISOString(),
      revenueUnits: margin.revenueUnits.toString(),
      costUnits: margin.costUnits.toString(),
      marginUnits: margin.marginUnits.toString(),
      marginPercent: margin.marginPercent,
      couponCreditsUnits: margin.couponCreditsUnits.toString(),
      cashRevenueUnits: margin.cashRevenueUnits.toString(),
      cashMarginUnits: margin.cashMarginUnits.toString(),
      cashMarginPercent: margin.cashMarginPercent,
    };
  }

  @Get('revenue/daily')
  async revenueDaily(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const filter = buildFilter(from, to);
    const rows: DailyRevenueRow[] = await this.analytics.getRevenueByDay(filter);
    return {
      items: rows.map((r) => ({
        date: r.date,
        revenueUnits: r.revenueUnits.toString(),
        requestCount: r.requestCount,
      })),
    };
  }

  @Get('cost/by-provider')
  async costByProvider(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const filter = buildFilter(from, to);
    const rows: CostByProviderRow[] = await this.analytics.getCostByProvider(filter);
    return {
      items: rows.map((r) => ({
        providerId: r.providerId,
        providerCode: r.providerCode,
        costUnits: r.costUnits.toString(),
        requestCount: r.requestCount,
      })),
    };
  }

  @Get('margin')
  async margin(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy', new DefaultValuePipe('day')) groupBy?: string,
  ) {
    const filter = buildFilter(from, to);
    if (groupBy !== 'day' && groupBy !== 'month') {
      throw new BadRequestException('groupBy must be day or month');
    }
    const m = await this.analytics.getMargin(filter);
    return {
      from: filter.from.toISOString(),
      to: filter.to.toISOString(),
      groupBy,
      revenueUnits: m.revenueUnits.toString(),
      costUnits: m.costUnits.toString(),
      marginUnits: m.marginUnits.toString(),
      marginPercent: m.marginPercent,
      couponCreditsUnits: m.couponCreditsUnits.toString(),
      cashRevenueUnits: m.cashRevenueUnits.toString(),
      cashMarginUnits: m.cashMarginUnits.toString(),
      cashMarginPercent: m.cashMarginPercent,
    };
  }

  @Get('top-users')
  async topUsers(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const filter = buildFilter(from, to);
    const rows: TopUserRow[] = await this.analytics.getTopUsers(filter, limit ?? 10);
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        spendUnits: r.spendUnits.toString(),
        requestCount: r.requestCount,
      })),
    };
  }

  @Get('top-methods')
  async topMethods(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const filter = buildFilter(from, to);
    const rows: TopMethodRow[] = await this.analytics.getTopMethods(filter, limit ?? 10);
    return {
      items: rows.map((r) => ({
        methodId: r.methodId,
        providerCode: r.providerCode,
        modelCode: r.modelCode,
        methodCode: r.methodCode,
        requestCount: r.requestCount,
        revenueUnits: r.revenueUnits.toString(),
      })),
    };
  }

  @Get('per-bundle')
  async perBundle(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> {
    const filter = buildFilter(from, to);
    const rows: BundleStatsRow[] = await this.analytics.getPerBundleStats(filter);
    return {
      items: rows.map((r) => ({
        providerCode: r.providerCode,
        modelCode: r.modelCode,
        methodCode: r.methodCode,
        resolution: r.resolution,
        requestCount: r.requestCount,
        revenueUnits: r.revenueUnits.toString(),
        providerCostUnits: r.providerCostUnits.toString(),
        marginUnits: r.marginUnits.toString(),
        errorRate: r.errorRate,
      })),
    };
  }
}
