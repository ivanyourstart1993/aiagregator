import { Module } from '@nestjs/common';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { GoogleBananaAdapter } from './adapters/google-banana.adapter';
import { GoogleVeoAdapter } from './adapters/google-veo.adapter';
import { KlingAiAdapter } from './adapters/kling-ai.adapter';
import { AdapterRegistry } from './adapters/adapter-registry';
import { AccountSelectorService } from './account-selector.service';
import { AccountRepository } from './account.repository';
import { AdminProviderAccountController } from './admin-provider-account.controller';
import { AdminProxyController } from './admin-proxy.controller';
import { PollLroCron } from './poll-lro.cron';
import { ProxyHealthCron } from './proxy-health.cron';
import { AccountHealthCron } from './account-health.cron';
import { CountersResetCron } from './counters-reset.cron';

@Module({
  imports: [RateCardsModule],
  controllers: [AdminProviderAccountController, AdminProxyController],
  providers: [
    GoogleBananaAdapter,
    GoogleVeoAdapter,
    KlingAiAdapter,
    AdapterRegistry,
    AccountSelectorService,
    AccountRepository,
    PollLroCron,
    ProxyHealthCron,
    AccountHealthCron,
    CountersResetCron,
  ],
  exports: [
    AdapterRegistry,
    AccountSelectorService,
    AccountRepository,
    GoogleBananaAdapter,
    GoogleVeoAdapter,
    KlingAiAdapter,
  ],
})
export class ProvidersModule {}
