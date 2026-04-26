import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CatalogStatus,
  type Prisma,
  RateCardPriceType,
  UserRole,
} from '@aiagg/db';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LogAdminAction } from '../../common/decorators/log-admin-action.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

interface RateCardDtoBase {
  providerId?: string;
  modelId?: string | null;
  methodId?: string | null;
  mode?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  priceType?: RateCardPriceType;
  providerCostUnits?: string | null;
  providerUnitCost?: string | null;
  pricePerSecond?: string | null;
  pricePerImage?: string | null;
  pricePerTokenInput?: string | null;
  pricePerTokenOutput?: string | null;
  batchDiscount?: number | null;
  priorityMultiplier?: number | null;
  providerCurrency?: string | null;
  validFrom?: string;
  validTo?: string | null;
  status?: CatalogStatus;
}

function toBigInt(v: string | null | undefined): bigint | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  try {
    return BigInt(v);
  } catch {
    throw new BadRequestException(`Invalid bigint value: ${v}`);
  }
}

function serialize(card: {
  id: string;
  providerId: string;
  modelId: string | null;
  methodId: string | null;
  mode: string | null;
  resolution: string | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  priceType: RateCardPriceType;
  providerCostUnits: bigint | null;
  providerUnitCost: bigint | null;
  pricePerSecond: bigint | null;
  pricePerImage: bigint | null;
  pricePerTokenInput: bigint | null;
  pricePerTokenOutput: bigint | null;
  batchDiscount: number | null;
  priorityMultiplier: number | null;
  currency: string;
  providerCurrency: string | null;
  validFrom: Date;
  validTo: Date | null;
  status: CatalogStatus;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    ...card,
    providerCostUnits: card.providerCostUnits?.toString() ?? null,
    providerUnitCost: card.providerUnitCost?.toString() ?? null,
    pricePerSecond: card.pricePerSecond?.toString() ?? null,
    pricePerImage: card.pricePerImage?.toString() ?? null,
    pricePerTokenInput: card.pricePerTokenInput?.toString() ?? null,
    pricePerTokenOutput: card.pricePerTokenOutput?.toString() ?? null,
  };
}

@Controller('internal/admin/rate-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminRateCardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('providerId') providerId?: string,
    @Query('active', new DefaultValuePipe(false), ParseBoolPipe) active?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSizeRaw?: number,
  ) {
    const pageNum = Math.max(page ?? 1, 1);
    const pageSize = Math.min(Math.max(pageSizeRaw ?? 50, 1), 200);
    const where: Prisma.ProviderRateCardWhereInput = {};
    if (providerId) where.providerId = providerId;
    if (active) {
      where.status = CatalogStatus.ACTIVE;
      where.validFrom = { lte: new Date() };
      where.OR = [{ validTo: null }, { validTo: { gte: new Date() } }];
    }
    const [items, total] = await Promise.all([
      this.prisma.providerRateCard.findMany({
        where,
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerRateCard.count({ where }),
    ]);
    return {
      items: items.map(serialize),
      total,
      page: pageNum,
      pageSize,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const card = await this.prisma.providerRateCard.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('rate_card_not_found');
    return serialize(card);
  }

  @Post()
  @LogAdminAction({ targetType: 'rate_card', action: 'create' })
  async create(@Body() body: RateCardDtoBase) {
    if (!body.providerId) throw new BadRequestException('providerId required');
    if (!body.priceType) throw new BadRequestException('priceType required');
    const created = await this.prisma.providerRateCard.create({
      data: {
        providerId: body.providerId,
        modelId: body.modelId ?? null,
        methodId: body.methodId ?? null,
        mode: body.mode ?? null,
        resolution: body.resolution ?? null,
        durationSeconds: body.durationSeconds ?? null,
        aspectRatio: body.aspectRatio ?? null,
        priceType: body.priceType,
        providerCostUnits: (toBigInt(body.providerCostUnits) ?? null) as bigint | null,
        providerUnitCost: (toBigInt(body.providerUnitCost) ?? null) as bigint | null,
        pricePerSecond: (toBigInt(body.pricePerSecond) ?? null) as bigint | null,
        pricePerImage: (toBigInt(body.pricePerImage) ?? null) as bigint | null,
        pricePerTokenInput: (toBigInt(body.pricePerTokenInput) ?? null) as bigint | null,
        pricePerTokenOutput: (toBigInt(body.pricePerTokenOutput) ?? null) as bigint | null,
        batchDiscount: body.batchDiscount ?? null,
        priorityMultiplier: body.priorityMultiplier ?? null,
        providerCurrency: body.providerCurrency ?? null,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validTo: body.validTo ? new Date(body.validTo) : null,
        status: body.status ?? CatalogStatus.ACTIVE,
      },
    });
    return serialize(created);
  }

  @Patch(':id')
  @LogAdminAction({ targetType: 'rate_card', action: 'update' })
  async update(@Param('id') id: string, @Body() body: RateCardDtoBase) {
    const existing = await this.prisma.providerRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('rate_card_not_found');
    const data: Prisma.ProviderRateCardUpdateInput = {};
    if (body.modelId !== undefined) data.modelId = body.modelId;
    if (body.methodId !== undefined) data.methodId = body.methodId;
    if (body.mode !== undefined) data.mode = body.mode;
    if (body.resolution !== undefined) data.resolution = body.resolution;
    if (body.durationSeconds !== undefined) data.durationSeconds = body.durationSeconds;
    if (body.aspectRatio !== undefined) data.aspectRatio = body.aspectRatio;
    if (body.priceType !== undefined) data.priceType = body.priceType;
    if (body.providerCostUnits !== undefined) data.providerCostUnits = toBigInt(body.providerCostUnits);
    if (body.providerUnitCost !== undefined) data.providerUnitCost = toBigInt(body.providerUnitCost);
    if (body.pricePerSecond !== undefined) data.pricePerSecond = toBigInt(body.pricePerSecond);
    if (body.pricePerImage !== undefined) data.pricePerImage = toBigInt(body.pricePerImage);
    if (body.pricePerTokenInput !== undefined) data.pricePerTokenInput = toBigInt(body.pricePerTokenInput);
    if (body.pricePerTokenOutput !== undefined) data.pricePerTokenOutput = toBigInt(body.pricePerTokenOutput);
    if (body.batchDiscount !== undefined) data.batchDiscount = body.batchDiscount;
    if (body.priorityMultiplier !== undefined) data.priorityMultiplier = body.priorityMultiplier;
    if (body.providerCurrency !== undefined) data.providerCurrency = body.providerCurrency;
    if (body.validFrom !== undefined) data.validFrom = new Date(body.validFrom);
    if (body.validTo !== undefined) data.validTo = body.validTo ? new Date(body.validTo) : null;
    if (body.status !== undefined) data.status = body.status;
    const updated = await this.prisma.providerRateCard.update({ where: { id }, data });
    return serialize(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @LogAdminAction({ targetType: 'rate_card', action: 'delete' })
  async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.prisma.providerRateCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('rate_card_not_found');
    await this.prisma.providerRateCard.delete({ where: { id } });
  }
}
