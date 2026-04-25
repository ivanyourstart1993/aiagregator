import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export type CouponContext = 'standalone' | 'request' | 'topup';

export class ValidateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @IsOptional()
  @IsIn(['standalone', 'request', 'topup'])
  context?: CouponContext;
}
