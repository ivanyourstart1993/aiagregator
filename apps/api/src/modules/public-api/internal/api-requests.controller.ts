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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { ApiRequestView } from '../dto/views';

@Controller('internal/api-requests')
@UseGuards(JwtAuthGuard)
export class InternalApiRequestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize = 50,
  ): Promise<{
    items: ApiRequestView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const ps = Math.min(200, Math.max(1, pageSize));
    const p = Math.max(1, page);
    const where = { userId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.apiRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
      }),
      this.prisma.apiRequest.count({ where }),
    ]);
    return {
      items: rows.map(toView),
      total,
      page: p,
      pageSize: ps,
    };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<ApiRequestView> {
    const row = await this.prisma.apiRequest.findFirst({
      where: { id, userId: user.id },
    });
    if (!row) throw new NotFoundException('ApiRequest not found');
    return toView(row);
  }
}

function toView(r: {
  id: string;
  status: import('@aiagg/db').ApiRequestStatus;
  methodId: string;
  bundleKey: string;
  basePriceUnits: bigint;
  discountUnits: bigint;
  clientPriceUnits: bigint;
  pricingSnapshotId: string | null;
  reservationId: string | null;
  couponId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  finalizedAt: Date | null;
}): ApiRequestView {
  return {
    id: r.id,
    status: r.status,
    method_id: r.methodId,
    bundle_key: r.bundleKey,
    base_price_units: r.basePriceUnits,
    discount_units: r.discountUnits,
    client_price_units: r.clientPriceUnits,
    pricing_snapshot_id: r.pricingSnapshotId,
    reservation_id: r.reservationId,
    coupon_id: r.couponId,
    error_code: r.errorCode,
    error_message: r.errorMessage,
    created_at: r.createdAt,
    finalized_at: r.finalizedAt,
  };
}
