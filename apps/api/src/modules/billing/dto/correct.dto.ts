import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function toBigInt({ value }: { value: unknown }): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value)) {
      throw new TypeError(`amountUnits must be a decimal integer string, got ${value}`);
    }
    return BigInt(value);
  }
  throw new TypeError(`Unsupported amountUnits type: ${typeof value}`);
}

/**
 * Signed correction. Positive values credit, negative values debit. Admin-only.
 * Wallet may be driven negative if `allowNegative` is set (default true for admin).
 */
export class CorrectDto {
  @Transform(toBigInt, { toClassOnly: true })
  amountUnits!: bigint;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
