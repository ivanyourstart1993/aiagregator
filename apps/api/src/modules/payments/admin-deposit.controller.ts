import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { type Deposit, DepositStatus, UserRole } from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DepositService } from './deposit.service';

@Controller('internal/admin/payments/deposits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDepositController {
  constructor(private readonly deposits: DepositService) {}

  @Get()
  list(
    @Query('userId') userId?: string,
    @Query('status') statusRaw?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const allowed = Object.values(DepositStatus) as string[];
    const status =
      statusRaw && allowed.includes(statusRaw) ? (statusRaw as DepositStatus) : undefined;
    return this.deposits.adminListDeposits({ userId, status, page, pageSize });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<Deposit> {
    return this.deposits.adminGetDeposit(id);
  }
}
