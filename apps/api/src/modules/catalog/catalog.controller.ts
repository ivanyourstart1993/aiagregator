import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';

@Controller('internal/catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('providers')
  @Public()
  async listProviders() {
    const providers = await this.catalog.listProviders();
    return { items: providers.map((p) => this.catalog.toProviderView(p)) };
  }

  @Get('methods')
  @Public()
  async listMethods(
    @Query('provider') providerCode?: string,
    @Query('model') modelCode?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const items = await this.catalog.listPublicMethods(user?.id, {
      providerCode,
      modelCode,
    });
    return { items };
  }

  @Get('methods/:provider/:model/:method')
  @Public()
  async getMethod(
    @Param('provider') providerCode: string,
    @Param('model') modelCode: string,
    @Param('method') methodCode: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.catalog.getPublicMethod(
      providerCode,
      modelCode,
      methodCode,
      user?.id,
    );
  }
}
