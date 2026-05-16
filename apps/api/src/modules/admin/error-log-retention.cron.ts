// ErrorLogRetentionCron — daily at 04:00 server time, delete ApiErrorLog rows
// older than the retention window. 30 days by default; override via
// API_ERROR_LOG_RETENTION_DAYS env var if support wants longer history.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ErrorLogRetentionCron {
  private readonly logger = new Logger(ErrorLogRetentionCron.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      const days = Math.max(
        1,
        Number(process.env.API_ERROR_LOG_RETENTION_DAYS ?? 30),
      );
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await this.prisma.apiErrorLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(
          `purged ${result.count} ApiErrorLog rows older than ${days}d`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `error-log-retention tick failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
