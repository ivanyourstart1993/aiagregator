import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AdminAnalyticsController } from './admin-analytics.controller';

@Module({
  controllers: [AdminAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
