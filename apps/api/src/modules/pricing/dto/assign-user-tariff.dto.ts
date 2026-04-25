import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AssignUserTariffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tariffId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
