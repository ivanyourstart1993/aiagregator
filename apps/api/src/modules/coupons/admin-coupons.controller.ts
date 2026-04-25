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
import { CouponStatus, CouponType, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Controller('internal/admin/coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const allowedTypes = Object.values(CouponType) as string[];
    const allowedStatuses = Object.values(CouponStatus) as string[];
    return this.coupons.adminListCoupons({
      type:
        type && allowedTypes.includes(type) ? (type as CouponType) : undefined,
      status:
        status && allowedStatuses.includes(status)
          ? (status as CouponStatus)
          : undefined,
      q,
      page,
      pageSize,
    });
  }

  @Get('redemptions')
  redemptionsFeed(
    @Query('couponId') couponId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    return this.coupons.adminListRedemptions({
      couponId,
      userId,
      from: parseDate(from),
      to: parseDate(to),
      page,
      pageSize,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'coupon.create', targetType: 'coupon' })
  create(
    @Body() body: CreateCouponDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.coupons.adminCreateCoupon({
      code: body.code,
      type: body.type,
      value: body.value,
      currency: body.currency,
      methodCode: body.methodCode,
      bundleId: body.bundleId,
      minTopupUnits: body.minTopupUnits,
      maxUses: body.maxUses,
      maxUsesPerUser: body.maxUsesPerUser,
      validFrom: body.validFrom,
      validTo: body.validTo,
      status: body.status,
      comment: body.comment,
      createdById: admin.id,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.coupons.adminGetCoupon(id);
  }

  @Patch(':id')
  @LogAdminAction({
    action: 'coupon.update',
    targetType: 'coupon',
    targetIdFrom: 'params.id',
  })
  update(@Param('id') id: string, @Body() body: UpdateCouponDto) {
    return this.coupons.adminUpdateCoupon(id, body);
  }

  @Delete(':id')
  @LogAdminAction({
    action: 'coupon.delete',
    targetType: 'coupon',
    targetIdFrom: 'params.id',
  })
  remove(@Param('id') id: string) {
    return this.coupons.adminDeleteCoupon(id);
  }

  @Get(':id/redemptions')
  redemptions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    return this.coupons.adminListRedemptions({ couponId: id, page, pageSize });
  }
}
