import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CouponStatus, CouponType, Currency } from '@aiagg/db';

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

export class CreateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @Transform(toBigInt, { toClassOnly: true })
  value!: bigint;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

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
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  comment?: string;
}
