import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function toBigInt({ value }: { value: unknown }): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value)) {
      throw new TypeError(`captureUnits must be a decimal integer string, got ${value}`);
    }
    return BigInt(value);
  }
  throw new TypeError(`Unsupported captureUnits type: ${typeof value}`);
}

export class CaptureDto {
  @Transform(toBigInt, { toClassOnly: true })
  captureUnits!: bigint;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  idempotencyKey!: string;
}
