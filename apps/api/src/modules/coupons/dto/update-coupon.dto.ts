import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CouponStatus } from '@aiagg/db';

function toBigInt({ value }: { value: unknown }): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value)) {
      throw new TypeError(`value must be a decimal integer string, got ${value}`);
    }
    return BigInt(value);
  }
  throw new TypeError(`Unsupported value type: ${typeof value}`);
}

export class UpdateCouponDto {
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUsesPerUser?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  methodCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bundleId?: string;

  @IsOptional()
  @Transform(toBigInt, { toClassOnly: true })
  minTopupUnits?: bigint;

  @IsOptional()
  @Transform(toBigInt, { toClassOnly: true })
  value?: bigint;
}
