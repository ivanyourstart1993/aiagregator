import { BundleMethod, BundleUnit } from '@aiagg/db';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertBundleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  providerSlug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelSlug!: string;

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

  @IsOptional()
  @IsEnum(BundleUnit)
  unit?: BundleUnit;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBundleDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(BundleUnit)
  unit?: BundleUnit;
}
