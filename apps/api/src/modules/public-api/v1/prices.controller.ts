import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PricingService } from '../../pricing/pricing.service';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import type { AuthContext } from '../dto/views';

@Controller('v1/prices')
export class PricesController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @PublicApi()
  async list(
    @CurrentApiCaller() auth: AuthContext,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
    @Query('method') method?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize = 50,
  ): Promise<{
    success: true;
    items: unknown[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const all = await this.pricing.previewAllForUser(auth.user.id, {
      provider,
      model,
      method,
    });
    const ps = Math.min(200, Math.max(1, pageSize));
    const p = Math.max(1, page);
    const slice = all.slice((p - 1) * ps, p * ps);
    const items = slice.map((row) => ({
      provider: row.bundle.providerSlug,
      model: row.bundle.modelSlug,
      method: row.bundle.method,
      bundle_key: row.bundle.bundleKey,
      mode: row.bundle.mode,
      resolution: row.bundle.resolution,
      duration_seconds: row.bundle.durationSeconds,
      aspect_ratio: row.bundle.aspectRatio,
      unit: row.bundle.unit,
      currency: row.currency,
      source: row.source,
      pricing_rule_id: row.sourceRefId,
      components: row.components,
    }));
    return {
      success: true,
      items,
      page: p,
      pageSize: ps,
      total: all.length,
    };
  }
}
