import { Module } from '@nestjs/common';
import { RedisModule } from '../../common/redis/redis.module';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminTariffService } from './admin-tariff.service';
import { AdminUserPricingService } from './admin-user-pricing.service';
import { BundleService } from './bundle.service';
import { PricingCacheInvalidator } from './pricing-cache.invalidator';
import { PricingCacheService } from './pricing-cache.service';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { SnapshotService } from './snapshot.service';
import { TariffService } from './tariff.service';

@Module({
  imports: [RedisModule],
  controllers: [PricingController, AdminPricingController],
  providers: [
    PricingService,
    BundleService,
    SnapshotService,
    TariffService,
    AdminTariffService,
    AdminUserPricingService,
    PricingCacheService,
    PricingCacheInvalidator,
  ],
  exports: [PricingService, BundleService, SnapshotService, TariffService],
})
export class PricingModule {}
