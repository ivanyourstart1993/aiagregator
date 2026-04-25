import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { toOptionalBigInt } from './bigint-transform';

export class UpsertBundlePriceDto {
  @IsOptional()
  @Transform(toOptionalBigInt, { toClassOnly: true })
  basePriceUnits?: bigint;

  @IsOptional()
  @Transform(toOptionalBigInt, { toClassOnly: true })
  inputPerTokenUnits?: bigint;

  @IsOptional()
  @Transform(toOptionalBigInt, { toClassOnly: true })
  outputPerTokenUnits?: bigint;

  @IsOptional()
  @Transform(toOptionalBigInt, { toClassOnly: true })
  perSecondUnits?: bigint;

  @IsOptional()
  @Transform(toOptionalBigInt, { toClassOnly: true })
  perImageUnits?: bigint;

  @IsOptional()
  @Transform(toOptionalBigInt, { toClassOnly: true })
  providerCostUnits?: bigint;

  @IsOptional()
  @IsInt()
  @Min(0)
  marginBps?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BatchUpsertBundlePriceItemDto extends UpsertBundlePriceDto {
  @IsString()
  @MaxLength(64)
  bundleId!: string;
}

export class BatchUpsertBundlePriceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BatchUpsertBundlePriceItemDto)
  items!: BatchUpsertBundlePriceItemDto[];
}
