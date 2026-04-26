import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AdminAlertsController } from './admin-alerts.controller';
import { HealthCheckCron } from './health-check.cron';

@Module({
  controllers: [AdminAlertsController],
  providers: [AlertsService, HealthCheckCron],
  exports: [AlertsService],
})
export class AlertsModule {}
