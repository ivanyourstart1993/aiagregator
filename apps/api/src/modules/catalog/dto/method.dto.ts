import { AvailabilityScope, CatalogStatus } from '@aiagg/db';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMethodDto {
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

  @IsObject()
  parametersSchema!: Record<string, unknown>;

  @IsOptional()
  exampleRequest?: unknown;

  @IsOptional()
  exampleResponse?: unknown;

  @IsOptional()
  @IsBoolean()
  supportsSync?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsAsync?: boolean;

  @IsOptional()
  @IsEnum(AvailabilityScope)
  availability?: AvailabilityScope;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  availabilityUserIds?: string[];

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMethodDto {
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
  @IsObject()
  parametersSchema?: Record<string, unknown>;

  @IsOptional()
  exampleRequest?: unknown;

  @IsOptional()
  exampleResponse?: unknown;

  @IsOptional()
  @IsBoolean()
  supportsSync?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsAsync?: boolean;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetAvailabilityDto {
  @IsEnum(AvailabilityScope)
  scope!: AvailabilityScope;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  userIds?: string[];
}
