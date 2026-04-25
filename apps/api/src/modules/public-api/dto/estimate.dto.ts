import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class EstimateDto {
  @IsString()
  @MaxLength(64)
  provider!: string;

  @IsString()
  @MaxLength(64)
  model!: string;

  @IsString()
  @MaxLength(64)
  method!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  mode?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  coupon?: string;
}
