import { IsNotEmpty, IsString } from 'class-validator';

export class DevTokenDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
