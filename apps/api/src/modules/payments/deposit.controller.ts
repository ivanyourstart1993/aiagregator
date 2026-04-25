import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { type Deposit, PaymentProvider as PaymentProviderEnum } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { DepositService } from './deposit.service';

class CreateInvoiceDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;

  @IsOptional()
  @IsEnum(PaymentProviderEnum)
  provider?: PaymentProviderEnum;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  couponCode?: string;
}

@Controller('internal/payments/top-up')
@UseGuards(JwtAuthGuard)
export class DepositController {
  constructor(private readonly deposits: DepositService) {}

  @Post('invoice')
  @HttpCode(HttpStatus.CREATED)
  createInvoice(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateInvoiceDto,
  ) {
    return this.deposits.createDeposit(
      user.id,
      body.amountCents,
      body.provider,
      body.couponCode,
    );
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<Deposit> {
    return this.deposits.getDeposit(user.id, id);
  }

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.deposits.listDeposits(user.id, page, pageSize);
  }
}
