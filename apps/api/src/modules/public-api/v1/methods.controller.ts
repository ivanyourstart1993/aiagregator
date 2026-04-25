import { Controller, Get, Query } from '@nestjs/common';
import { CatalogService } from '../../catalog/catalog.service';
import { PublicApi } from '../decorators/public-api.decorator';
import { CurrentApiCaller } from '../decorators/current-api-caller.decorator';
import type { AuthContext } from '../dto/views';

@Controller('v1/methods')
export class MethodsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @PublicApi()
  async list(
    @CurrentApiCaller() auth: AuthContext,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
  ): Promise<{ success: true; items: unknown[] }> {
    const items = await this.catalog.listPublicMethods(auth.user.id, {
      providerCode: provider,
      modelCode: model,
    });
    // Strip internal pricing fields — public list does not expose prices.
    const sanitised = items.map((m) => ({
      provider: m.providerCode,
      model: m.modelCode,
      method: m.code,
      public_name: m.publicName,
      description: m.description,
      parameters_schema: m.parametersSchema,
      example_request: m.exampleRequest,
      example_response: m.exampleResponse,
      supports_sync: m.supportsSync,
      supports_async: m.supportsAsync,
    }));
    return { success: true, items: sanitised };
  }
}
