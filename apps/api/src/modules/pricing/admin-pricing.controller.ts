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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BundleMethod, UserRole } from '@aiagg/db';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { TariffService } from './tariff.service';
import { BundleService } from './bundle.service';
import { AdminTariffService } from './admin-tariff.service';
import { AdminUserPricingService } from './admin-user-pricing.service';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';
import {
  BatchUpsertBundlePriceDto,
  UpsertBundlePriceDto,
} from './dto/upsert-bundle-price.dto';
import { AssignUserTariffDto } from './dto/assign-user-tariff.dto';
import { UpsertUserBundlePriceDto } from './dto/upsert-user-bundle-price.dto';
import { UpdateBundleDto, UpsertBundleDto } from './dto/upsert-bundle.dto';

@Controller('internal/admin/pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminPricingController {
  constructor(
    private readonly tariffs: TariffService,
    private readonly bundles: BundleService,
    private readonly adminTariffs: AdminTariffService,
    private readonly adminUserPricing: AdminUserPricingService,
  ) {}

  // -- Tariff CRUD --------------------------------------------------------

  @Get('tariffs')
  listTariffs(
    @Query('active') active?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const activeFilter =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.tariffs.list({ active: activeFilter, page, pageSize });
  }

  @Post('tariffs')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'tariff.create', targetType: 'tariff' })
  createTariff(
    @Body() body: CreateTariffDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminTariffs.createTariff(body, { actorId: admin.id });
  }

  @Get('tariffs/:id')
  async getTariff(@Param('id') id: string) {
    return this.tariffs.getById(id);
  }

  @Patch('tariffs/:id')
  @LogAdminAction({ action: 'tariff.update', targetType: 'tariff', targetIdFrom: 'params.id' })
  updateTariff(
    @Param('id') id: string,
    @Body() body: UpdateTariffDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminTariffs.updateTariff(id, body, { actorId: admin.id });
  }

  @Post('tariffs/:id/set-default')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'tariff.set_default',
    targetType: 'tariff',
    targetIdFrom: 'params.id',
  })
  setDefault(@Param('id') id: string, @CurrentUser() admin: CurrentUserPayload) {
    return this.adminTariffs.setDefault(id, { actorId: admin.id });
  }

  @Delete('tariffs/:id')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({ action: 'tariff.delete', targetType: 'tariff', targetIdFrom: 'params.id' })
  deleteTariff(@Param('id') id: string, @CurrentUser() admin: CurrentUserPayload) {
    return this.adminTariffs.deleteTariff(id, { actorId: admin.id });
  }

  // -- Bundle prices in tariff -------------------------------------------

  @Get('tariffs/:id/prices')
  async listBundlePrices(@Param('id') tariffId: string) {
    await this.tariffs.getById(tariffId);
    return this.tariffs.listBundlePrices(tariffId);
  }

  @Put('tariffs/:id/prices/:bundleId')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'tariff_bundle_price.upsert',
    targetType: 'tariff_bundle_price',
    targetIdFrom: 'params.id',
  })
  upsertBundlePrice(
    @Param('id') tariffId: string,
    @Param('bundleId') bundleId: string,
    @Body() body: UpsertBundlePriceDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminTariffs.upsertBundlePrice(tariffId, bundleId, body, {
      actorId: admin.id,
      reason: body.reason,
    });
  }

  @Put('tariffs/:id/prices/batch')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'tariff_bundle_price.upsert',
    targetType: 'tariff',
    targetIdFrom: 'params.id',
  })
  batchUpsertBundlePrices(
    @Param('id') tariffId: string,
    @Body() body: BatchUpsertBundlePriceDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminTariffs.batchUpsertBundlePrices(tariffId, body, {
      actorId: admin.id,
    });
  }

  @Delete('tariffs/:id/prices/:bundleId')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'tariff_bundle_price.delete',
    targetType: 'tariff_bundle_price',
    targetIdFrom: 'params.id',
  })
  deleteBundlePrice(
    @Param('id') tariffId: string,
    @Param('bundleId') bundleId: string,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminTariffs.deleteBundlePrice(tariffId, bundleId, {
      actorId: admin.id,
    });
  }

  // -- User-specific pricing ---------------------------------------------

  @Post('users/:userId/assign-tariff')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'user_tariff.assign',
    targetType: 'user',
    targetIdFrom: 'params.userId',
  })
  assignTariff(
    @Param('userId') userId: string,
    @Body() body: AssignUserTariffDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminUserPricing.assignTariff(userId, body.tariffId, {
      actorId: admin.id,
      reason: body.reason,
    });
  }

  @Delete('users/:userId/assign-tariff')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'user_tariff.unassign',
    targetType: 'user',
    targetIdFrom: 'params.userId',
  })
  removeAssignment(
    @Param('userId') userId: string,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminUserPricing.removeAssignment(userId, { actorId: admin.id });
  }

  @Put('users/:userId/bundle-prices/:bundleId')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'user_bundle_price.upsert',
    targetType: 'user',
    targetIdFrom: 'params.userId',
  })
  upsertUserBundlePrice(
    @Param('userId') userId: string,
    @Param('bundleId') bundleId: string,
    @Body() body: UpsertUserBundlePriceDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminUserPricing.upsertUserBundlePrice(userId, bundleId, body, {
      actorId: admin.id,
      reason: body.reason,
    });
  }

  @Delete('users/:userId/bundle-prices/:bundleId')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'user_bundle_price.delete',
    targetType: 'user',
    targetIdFrom: 'params.userId',
  })
  removeUserBundlePrice(
    @Param('userId') userId: string,
    @Param('bundleId') bundleId: string,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.adminUserPricing.removeUserBundlePrice(userId, bundleId, {
      actorId: admin.id,
    });
  }

  @Get('users/:userId/bundle-prices')
  listUserBundlePrices(@Param('userId') userId: string) {
    return this.adminUserPricing.listUserBundlePrices(userId);
  }

  // -- Bundles catalog ----------------------------------------------------

  @Get('bundles')
  listBundles(
    @Query('provider') provider?: string,
    @Query('model') model?: string,
    @Query('method') method?: string,
    @Query('active') active?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const allowedMethods = Object.values(BundleMethod) as string[];
    const methodFilter =
      method && allowedMethods.includes(method) ? (method as BundleMethod) : undefined;
    const activeFilter =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.bundles.list({
      provider,
      model,
      method: methodFilter,
      active: activeFilter,
      page,
      pageSize,
    });
  }

  @Post('bundles')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'bundle.upsert', targetType: 'bundle' })
  upsertBundle(@Body() body: UpsertBundleDto) {
    return this.bundles.ensureBundle({
      providerSlug: body.providerSlug,
      modelSlug: body.modelSlug,
      method: body.method,
      mode: body.mode,
      resolution: body.resolution,
      durationSeconds: body.durationSeconds,
      aspectRatio: body.aspectRatio,
      unit: body.unit,
    });
  }

  @Patch('bundles/:id')
  @LogAdminAction({ action: 'bundle.update', targetType: 'bundle', targetIdFrom: 'params.id' })
  updateBundle(@Param('id') id: string, @Body() body: UpdateBundleDto) {
    return this.bundles.updateBundle(id, body);
  }

  // -- Audit --------------------------------------------------------------

  @Get('changes')
  listChanges(
    @Query('tariffId') tariffId?: string,
    @Query('userId') userId?: string,
    @Query('bundleId') bundleId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    return this.adminTariffs.listChanges({
      tariffId,
      userId,
      bundleId,
      page,
      pageSize,
    });
  }
}
