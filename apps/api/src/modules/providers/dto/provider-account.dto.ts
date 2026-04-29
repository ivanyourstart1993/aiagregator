import { ProviderAccountStatus } from '@aiagg/db';
import {
  ArrayMaxSize,
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

export class CreateProviderAccountDto {
  @IsString()
  @MinLength(1)
  providerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsObject()
  credentials!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  proxyId?: string;

  @IsOptional()
  @IsEnum(ProviderAccountStatus)
  status?: ProviderAccountStatus;

  @IsOptional()
  @IsBoolean()
  rotationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxConcurrentTasks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRequestsPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRequestsPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRequestsPerDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  supportedModelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(128)
  @IsString({ each: true })
  supportedMethodIds?: string[];

  // USD as a float (e.g. 35 means $35). Service-side converts to nano-USD.
  @IsOptional()
  acquisitionCostUsd?: number;
}

export class UpdateProviderAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  proxyId?: string | null;

  @IsOptional()
  @IsEnum(ProviderAccountStatus)
  status?: ProviderAccountStatus;

  @IsOptional()
  @IsBoolean()
  rotationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxConcurrentTasks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRequestsPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRequestsPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRequestsPerDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  supportedModelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(128)
  @IsString({ each: true })
  supportedMethodIds?: string[];

  @IsOptional()
  acquisitionCostUsd?: number;
}
