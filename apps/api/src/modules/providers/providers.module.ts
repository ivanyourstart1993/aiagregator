import { Module } from '@nestjs/common';
import { GoogleBananaAdapter } from './adapters/google-banana.adapter';
import { AdapterRegistry } from './adapters/adapter-registry';
import { AccountSelectorService } from './account-selector.service';
import { AccountRepository } from './account.repository';
import { AdminProviderAccountController } from './admin-provider-account.controller';
import { AdminProxyController } from './admin-proxy.controller';

@Module({
  controllers: [AdminProviderAccountController, AdminProxyController],
  providers: [
    GoogleBananaAdapter,
    AdapterRegistry,
    AccountSelectorService,
    AccountRepository,
  ],
  exports: [
    AdapterRegistry,
    AccountSelectorService,
    AccountRepository,
    GoogleBananaAdapter,
  ],
})
export class ProvidersModule {}
