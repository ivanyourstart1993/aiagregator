import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CouponsModule } from '../coupons/coupons.module';
import { DepositController } from './deposit.controller';
import { AdminDepositController } from './admin-deposit.controller';
import { CryptomusWebhookController } from './webhooks/cryptomus.webhook.controller';
import { OxapayWebhookController } from './webhooks/oxapay.webhook.controller';
import { DepositService } from './deposit.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { CryptomusProvider } from './providers/cryptomus.provider';
import { OxapayProvider } from './providers/oxapay.provider';

@Module({
  imports: [BillingModule, CouponsModule],
  controllers: [
    DepositController,
    AdminDepositController,
    CryptomusWebhookController,
    OxapayWebhookController,
  ],
  providers: [
    DepositService,
    PaymentProviderRegistry,
    CryptomusProvider,
    OxapayProvider,
  ],
  exports: [DepositService, PaymentProviderRegistry],
})
export class PaymentsModule {}
