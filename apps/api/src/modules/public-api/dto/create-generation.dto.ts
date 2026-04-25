import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateGenerationDto {
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

  @IsObject()
  params!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  coupon?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  callback_url?: string;
}
