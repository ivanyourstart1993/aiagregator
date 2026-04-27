import { IsString, MaxLength, MinLength } from 'class-validator';

export class SupportContactDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;
}
