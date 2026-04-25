import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReleaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  idempotencyKey!: string;
}
