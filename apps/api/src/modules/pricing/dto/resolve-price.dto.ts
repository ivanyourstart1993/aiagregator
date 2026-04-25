import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { BundleSpecDto } from './bundle-spec.dto';

export class ResolvePriceDto {
  @ValidateNested()
  @Type(() => BundleSpecDto)
  bundleSpec!: BundleSpecDto;

  @IsOptional()
  @IsBoolean()
  persistSnapshot?: boolean;
}
