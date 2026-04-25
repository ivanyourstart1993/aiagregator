import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CatalogStatus, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { AdminCatalogService } from './admin-catalog.service';
import { CatalogService } from './catalog.service';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { CreateModelDto, UpdateModelDto } from './dto/model.dto';
import {
  CreateMethodDto,
  SetAvailabilityDto,
  UpdateMethodDto,
} from './dto/method.dto';

@Controller('internal/admin/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCatalogController {
  constructor(
    private readonly admin: AdminCatalogService,
    private readonly catalog: CatalogService,
  ) {}

  // ---- Providers --------------------------------------------------------

  @Get('providers')
  async listProviders(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const allowed = Object.values(CatalogStatus) as string[];
    const statusFilter =
      status && allowed.includes(status) ? (status as CatalogStatus) : undefined;
    const result = await this.admin.listProviders({
      status: statusFilter,
      page,
      pageSize,
    });
    return {
      ...result,
      items: result.items.map((p) => this.catalog.toProviderView(p)),
    };
  }

  @Post('providers')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'catalog.provider.create', targetType: 'provider' })
  async createProvider(@Body() body: CreateProviderDto) {
    const p = await this.admin.createProvider(body);
    return this.catalog.toProviderView(p);
  }

  @Get('providers/:id')
  async getProvider(@Param('id') id: string) {
    const p = await this.admin.getProvider(id);
    return this.catalog.toProviderView(p);
  }

  @Patch('providers/:id')
  @LogAdminAction({
    action: 'catalog.provider.update',
    targetType: 'provider',
    targetIdFrom: 'params.id',
  })
  async updateProvider(
    @Param('id') id: string,
    @Body() body: UpdateProviderDto,
  ) {
    const p = await this.admin.updateProvider(id, body);
    return this.catalog.toProviderView(p);
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'catalog.provider.delete',
    targetType: 'provider',
    targetIdFrom: 'params.id',
  })
  deleteProvider(@Param('id') id: string) {
    return this.admin.deleteProvider(id);
  }

  // ---- Models -----------------------------------------------------------

  @Get('providers/:providerId/models')
  async listModels(@Param('providerId') providerId: string) {
    const items = await this.admin.listModels(providerId);
    const provider = await this.admin.getProvider(providerId);
    return {
      items: items.map((m) =>
        this.catalog.toModelView({ ...m, provider }),
      ),
    };
  }

  @Post('providers/:providerId/models')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({
    action: 'catalog.model.create',
    targetType: 'model',
    targetIdFrom: 'params.providerId',
  })
  async createModel(
    @Param('providerId') providerId: string,
    @Body() body: CreateModelDto,
  ) {
    const m = await this.admin.createModel(providerId, body);
    const provider = await this.admin.getProvider(providerId);
    return this.catalog.toModelView({ ...m, provider });
  }

  @Patch('models/:id')
  @LogAdminAction({
    action: 'catalog.model.update',
    targetType: 'model',
    targetIdFrom: 'params.id',
  })
  async updateModel(@Param('id') id: string, @Body() body: UpdateModelDto) {
    const m = await this.admin.updateModel(id, body);
    return this.catalog.toModelView(m);
  }

  @Delete('models/:id')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'catalog.model.delete',
    targetType: 'model',
    targetIdFrom: 'params.id',
  })
  deleteModel(@Param('id') id: string) {
    return this.admin.deleteModel(id);
  }

  // ---- Methods ----------------------------------------------------------

  @Get('models/:modelId/methods')
  async listMethods(@Param('modelId') modelId: string) {
    const items = await this.admin.listMethods(modelId);
    const model = await this.admin.getModel(modelId);
    return {
      items: items.map((m) =>
        this.catalog.toAdminMethodView({ ...m, model }),
      ),
    };
  }

  @Post('models/:modelId/methods')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({
    action: 'catalog.method.create',
    targetType: 'method',
    targetIdFrom: 'params.modelId',
  })
  async createMethod(
    @Param('modelId') modelId: string,
    @Body() body: CreateMethodDto,
  ) {
    const created = await this.admin.createMethod(modelId, body);
    const full = await this.admin.getMethod(created.id);
    return this.catalog.toAdminMethodView(full);
  }

  @Get('methods/:id')
  async getMethod(@Param('id') id: string) {
    const m = await this.admin.getMethod(id);
    return this.catalog.toAdminMethodView(m);
  }

  @Patch('methods/:id')
  @LogAdminAction({
    action: 'catalog.method.update',
    targetType: 'method',
    targetIdFrom: 'params.id',
  })
  async updateMethod(@Param('id') id: string, @Body() body: UpdateMethodDto) {
    await this.admin.updateMethod(id, body);
    const full = await this.admin.getMethod(id);
    return this.catalog.toAdminMethodView(full);
  }

  @Post('methods/:id/availability')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'catalog.method.set_availability',
    targetType: 'method',
    targetIdFrom: 'params.id',
  })
  async setAvailability(
    @Param('id') id: string,
    @Body() body: SetAvailabilityDto,
  ) {
    await this.admin.setAvailability(id, body);
    const full = await this.admin.getMethod(id);
    return this.catalog.toAdminMethodView(full);
  }

  @Delete('methods/:id')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'catalog.method.delete',
    targetType: 'method',
    targetIdFrom: 'params.id',
  })
  deleteMethod(@Param('id') id: string) {
    return this.admin.deleteMethod(id);
  }
}
