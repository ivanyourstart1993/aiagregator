import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CouponsService } from './coupons.service';
import { BillingService } from '../billing/billing.service';

@Controller('internal/coupons')
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly billing: BillingService,
  ) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ValidateCouponDto,
  ) {
    return this.coupons.validate(body.code, user.id, body.context);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.CREATED)
  async redeem(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ApplyCouponDto,
  ) {
    const result = await this.coupons.redeemStandalone(body.code, user.id);
    const balances = await this.billing.getBalances(user.id);
    return {
      coupon: result.coupon,
      transaction: result.transaction,
      balances,
    };
  }

  @Get('history')
  history(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.coupons.listRedemptions(user.id, page, pageSize);
  }
}
