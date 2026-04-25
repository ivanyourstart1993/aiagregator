import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransactionType } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Controller('internal/billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('balance')
  balance(@CurrentUser() user: CurrentUserPayload) {
    return this.billing.getBalances(user.id);
  }

  @Get('transactions')
  async transactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const allowedTypes = Object.values(TransactionType) as string[];
    const typeFilter =
      type && allowedTypes.includes(type) ? (type as TransactionType) : undefined;
    return this.billing.listTransactions(user.id, {
      type: typeFilter,
      from: parseDate(from),
      to: parseDate(to),
      page,
      pageSize,
    });
  }

  @Get('transactions/:id')
  async transaction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    const tx = await this.billing.getTransaction(user.id, id);
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }
}
