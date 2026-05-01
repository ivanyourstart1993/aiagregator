import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CouponsModule } from '../coupons/coupons.module';
import { PricingModule } from '../pricing/pricing.module';
import { MethodsController } from './v1/methods.controller';
import { PricesController } from './v1/prices.controller';
import { EstimateController } from './v1/estimate.controller';
import { GenerationsController } from './v1/generations.controller';
import { TasksController } from './v1/tasks.controller';
import { BalanceController } from './v1/balance.controller';
import { InternalApiRequestsController } from './internal/api-requests.controller';
import { InternalTasksController } from './internal/internal-tasks.controller';
import { EstimateService } from './services/estimate.service';
import { GenerationsService } from './services/generations.service';
import { TasksService } from './services/tasks.service';
import { PublicApiKeyGuard } from './guards/public-api-key.guard';
import { UserStatusGuard } from './guards/user-status.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { TaskSweeperCron } from './crons/task-sweeper.cron';

@Module({
  imports: [BillingModule, CatalogModule, CouponsModule, PricingModule],
  controllers: [
    MethodsController,
    PricesController,
    EstimateController,
    GenerationsController,
    TasksController,
    BalanceController,
    InternalApiRequestsController,
    InternalTasksController,
  ],
  providers: [
    EstimateService,
    GenerationsService,
    TasksService,
    PublicApiKeyGuard,
    UserStatusGuard,
    RateLimitGuard,
    IdempotencyInterceptor,
    TaskSweeperCron,
  ],
})
export class PublicApiModule {}
