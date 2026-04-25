import { Controller, Get } from '@nestjs/common';
import { BillingService } from '../../billing/billing.service';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import type { AuthContext } from '../dto/views';

@Controller('v1/balance')
export class BalanceController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @PublicApi()
  async get(
    @CurrentApiCaller() auth: AuthContext,
  ): Promise<{
    success: true;
    available: bigint;
    reserved: bigint;
    bonus_available: bigint;
    total: bigint;
    currency: string;
  }> {
    const b = await this.billing.getBalances(auth.user.id);
    return {
      success: true,
      available: b.available,
      reserved: b.reserved,
      bonus_available: b.bonusAvailable,
      total: b.total,
      currency: b.currency,
    };
  }
}
