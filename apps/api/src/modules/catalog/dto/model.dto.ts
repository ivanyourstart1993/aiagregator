import { CatalogStatus } from '@aiagg/db';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  publicName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  publicName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
