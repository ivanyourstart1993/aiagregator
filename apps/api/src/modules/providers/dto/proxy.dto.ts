import { ProxyProtocol, ProxyStatus } from '@aiagg/db';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProxyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsEnum(ProxyProtocol)
  protocol?: ProxyProtocol;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  login?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @IsOptional()
  @IsEnum(ProxyStatus)
  status?: ProxyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class UpdateProxyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsEnum(ProxyProtocol)
  protocol?: ProxyProtocol;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  login?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @IsOptional()
  @IsEnum(ProxyStatus)
  status?: ProxyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
