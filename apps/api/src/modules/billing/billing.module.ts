import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ReservationRepository } from './reservation.repository';
import { TransactionRepository } from './transaction.repository';
import { WalletRepository } from './wallet.repository';

@Module({
  controllers: [BillingController, AdminBillingController],
  providers: [BillingService, WalletRepository, TransactionRepository, ReservationRepository],
  exports: [BillingService, WalletRepository, TransactionRepository, ReservationRepository],
})
export class BillingModule {}
