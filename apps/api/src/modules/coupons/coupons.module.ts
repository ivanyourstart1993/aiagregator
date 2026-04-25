import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CouponsController } from './coupons.controller';
import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [BillingModule],
  controllers: [CouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
