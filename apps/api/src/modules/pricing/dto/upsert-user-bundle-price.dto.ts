import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { toOptionalBigInt } from './bigint-transform';

export class UpsertUserBundlePriceDto {
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
  @IsString()
  @MaxLength(500)
  reason?: string;
}
