// Stage 11 (full) — daily / monthly counter reset cron.
//
// `ProviderAccount` carries today*/month* counters used by the limiter. We
// reset:
//   * todayRequestsCount, todayCostUnits → daily at 00:00 UTC for accounts
//     whose countersResetAt is older than the current UTC day.
//   * monthRequestsCount, monthCostUnits → on the 1st of each month at 00:00
//     UTC for accounts whose countersResetAt is in a previous month.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CountersResetCron {
  private readonly logger = new Logger(CountersResetCron.name);

  constructor(private readonly prisma: PrismaService) {}

  // Daily at 00:00 UTC.
  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async dailyTick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const result = await this.prisma.providerAccount.updateMany({
        where: { countersResetAt: { lt: startOfDay } },
        data: {
          todayRequestsCount: 0,
          todayCostUnits: 0n,
          countersResetAt: new Date(),
        },
      });
      if (result.count > 0) {
        this.logger.log(`daily counter reset: ${result.count} accounts`);
      }
      // Monthly reset — only on the 1st of month.
      const now = new Date();
      if (now.getUTCDate() === 1) {
        const startOfMonth = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
        );
        const monthly = await this.prisma.providerAccount.updateMany({
          where: { countersResetAt: { lt: startOfMonth } },
          data: { monthRequestsCount: 0, monthCostUnits: 0n },
        });
        if (monthly.count > 0) {
          this.logger.log(`monthly counter reset: ${monthly.count} accounts`);
        }
      }
    } catch (err) {
      this.logger.warn(
        `counters-reset failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
