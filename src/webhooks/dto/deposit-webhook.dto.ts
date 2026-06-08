import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../../common/currencies';

/**
 * Shape of the deposit webhook body. Validated by the global ValidationPipe
 * (whitelist + forbidNonWhitelisted), so unexpected fields are rejected — an
 * attacker cannot smuggle extra properties past validation.
 *
 * NOTE: passing validation only proves the body is well-formed. Authenticity is
 * established separately by the HMAC guard over the raw bytes.
 */
export class DepositWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  userId!: string;

  // Money as a number with bounded precision. maxDecimalPlaces guards against
  // sub-satoshi dust and absurd precision; @IsPositive blocks zero/negative
  // "deposits" that could be used to game balances.
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  amount!: number;

  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  transactionId!: string;

  // Provider-supplied timestamp inside the body (ISO-8601 or epoch string).
  @IsString()
  @IsNotEmpty()
  timestamp!: string;
}
