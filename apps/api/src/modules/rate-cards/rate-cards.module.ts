import { Module } from '@nestjs/common';
import { RateCardService } from './rate-cards.service';
import { AdminRateCardController } from './admin-rate-card.controller';

@Module({
  controllers: [AdminRateCardController],
  providers: [RateCardService],
  exports: [RateCardService],
})
export class RateCardsModule {}
