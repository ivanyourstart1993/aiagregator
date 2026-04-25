import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PricingService } from './pricing.service';
import { TariffService } from './tariff.service';
import type { EffectivePriceView, TariffView, UserTariffView } from './dto/views';

@Controller('internal/pricing')
@UseGuards(JwtAuthGuard)
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly tariffs: TariffService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
    @Query('method') method?: string,
  ): Promise<EffectivePriceView[]> {
    return this.pricing.previewAllForUser(user.id, { provider, model, method });
  }

  @Get('bundle/:bundleKey')
  async byKey(
    @CurrentUser() user: CurrentUserPayload,
    @Param('bundleKey') bundleKey: string,
  ): Promise<EffectivePriceView | { found: false }> {
    const v = await this.pricing.previewByBundleKey(user.id, bundleKey);
    if (!v) return { found: false };
    return v;
  }

  @Get('tariff')
  async myTariff(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{
    source: 'user' | 'default' | 'none';
    tariff: TariffView | null;
    assignment: UserTariffView | null;
  }> {
    const ut = await this.tariffs.findUserTariff(user.id);
    if (ut && ut.tariff.isActive) {
      return {
        source: 'user',
        tariff: this.tariffs.toView(ut.tariff),
        assignment: this.tariffs.toUserTariffView(ut),
      };
    }
    const def = await this.tariffs.findDefault();
    return {
      source: def ? 'default' : 'none',
      tariff: def ? this.tariffs.toView(def) : null,
      assignment: null,
    };
  }
}
