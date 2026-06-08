import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../../common/currencies';

export class CreateWithdrawalDto {
  // @IsPositive blocks zero and negative amounts — a negative "withdrawal"
  // must never be allowed to increase a balance.
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  amount!: number;

  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  destinationAddress!: string;
}
