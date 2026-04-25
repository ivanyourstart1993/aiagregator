import { BundleMethod } from '@aiagg/db';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class BundleSpecDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  model!: string;

  @IsEnum(BundleMethod)
  method!: BundleMethod;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  resolution?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  aspectRatio?: string;
}
