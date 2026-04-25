import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type Reservation,
  type Transaction,
  TransactionType,
  UserRole,
} from '@aiagg/db';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { BillingService } from './billing.service';
import { CreditDto } from './dto/credit.dto';
import { DebitDto } from './dto/debit.dto';
import { CorrectDto } from './dto/correct.dto';
import { BonusDto } from './dto/bonus.dto';
import { ReserveDto } from './dto/reserve.dto';
import { CaptureDto } from './dto/capture.dto';
import { ReleaseDto } from './dto/release.dto';

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Controller('internal/admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

  // -- mutations -----------------------------------------------------------

  @Post('users/:userId/credit')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'wallet.credit', targetType: 'user', targetIdFrom: 'params.userId' })
  credit(
    @Param('userId') userId: string,
    @Body() body: CreditDto,
    @CurrentUser() admin: CurrentUserPayload,
  ): Promise<Transaction> {
    return this.billing.credit({
      userId,
      amountUnits: body.amountUnits,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      depositId: body.depositId,
      parentTransactionId: body.parentTransactionId,
      metadata: body.metadata,
      adminId: admin.id,
    });
  }

  @Post('users/:userId/debit')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'wallet.debit', targetType: 'user', targetIdFrom: 'params.userId' })
  debit(
    @Param('userId') userId: string,
    @Body() body: DebitDto,
    @CurrentUser() admin: CurrentUserPayload,
  ): Promise<Transaction> {
    return this.billing.debit({
      userId,
      amountUnits: body.amountUnits,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      metadata: body.metadata,
      adminId: admin.id,
    });
  }

  @Post('users/:userId/correct')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({
    action: 'wallet.correct',
    targetType: 'user',
    targetIdFrom: 'params.userId',
  })
  correct(
    @Param('userId') userId: string,
    @Body() body: CorrectDto,
    @CurrentUser() admin: CurrentUserPayload,
  ): Promise<Transaction> {
    return this.billing.correct({
      userId,
      amountUnits: body.amountUnits,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      metadata: body.metadata,
      adminId: admin.id,
      allowNegative: true,
    });
  }

  @Post('users/:userId/bonus')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({ action: 'wallet.bonus', targetType: 'user', targetIdFrom: 'params.userId' })
  bonus(
    @Param('userId') userId: string,
    @Body() body: BonusDto,
    @CurrentUser() admin: CurrentUserPayload,
  ): Promise<Transaction> {
    return this.billing.grantBonus({
      userId,
      amountUnits: body.amountUnits,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      metadata: body.metadata,
      adminId: admin.id,
    });
  }

  @Post('users/:userId/reserve')
  @HttpCode(HttpStatus.CREATED)
  @LogAdminAction({
    action: 'reservation.create',
    targetType: 'user',
    targetIdFrom: 'params.userId',
  })
  reserve(
    @Param('userId') userId: string,
    @Body() body: ReserveDto,
  ): Promise<Reservation> {
    return this.billing.reserve({
      userId,
      amountUnits: body.amountUnits,
      idempotencyKey: body.idempotencyKey,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      taskId: body.taskId,
      bundleKey: body.bundleKey,
      pricingSnapshotId: body.pricingSnapshotId,
      metadata: body.metadata,
    });
  }

  @Post('reservations/:rid/capture')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'reservation.capture',
    targetType: 'reservation',
    targetIdFrom: 'params.rid',
  })
  capture(
    @Param('rid') reservationId: string,
    @Body() body: CaptureDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.billing.capture(
      reservationId,
      body.captureUnits,
      body.idempotencyKey,
      admin.id,
    );
  }

  @Post('reservations/:rid/release')
  @HttpCode(HttpStatus.OK)
  @LogAdminAction({
    action: 'reservation.release',
    targetType: 'reservation',
    targetIdFrom: 'params.rid',
  })
  release(
    @Param('rid') reservationId: string,
    @Body() body: ReleaseDto,
    @CurrentUser() admin: CurrentUserPayload,
  ) {
    return this.billing.release(reservationId, body.idempotencyKey, admin.id);
  }

  // -- reads ---------------------------------------------------------------

  @Get('transactions')
  transactions(
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const allowedTypes = Object.values(TransactionType) as string[];
    const typeFilter =
      type && allowedTypes.includes(type) ? (type as TransactionType) : undefined;
    return this.billing.adminListTransactions({
      userId,
      type: typeFilter,
      from: parseDate(from),
      to: parseDate(to),
      page,
      pageSize,
    });
  }

  @Get('users/:userId/wallet')
  async wallet(@Param('userId') userId: string) {
    const main = await this.billing.getWallet(userId);
    const bonus = await this.billing.getBalances(userId);
    if (!main) throw new NotFoundException('Wallet not found');
    return { wallet: main, balances: bonus };
  }
}
