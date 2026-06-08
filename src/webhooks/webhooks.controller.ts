import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DepositWebhookDto } from './dto/deposit-webhook.dto';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * POST /webhooks/deposit
   *
   * The WebhookSignatureGuard authenticates the request (HMAC + freshness)
   * before this handler runs. We return 200 for both freshly-processed and
   * duplicate deposits: a duplicate is a successful no-op from the provider's
   * perspective, and returning 200 stops the provider from retrying forever.
   */
  @Post('deposit')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handleDeposit(@Body() dto: DepositWebhookDto): Promise<{
    status: 'processed' | 'duplicate';
    depositId?: string;
  }> {
    const result = await this.webhooksService.processDeposit(dto);
    return result.status === 'processed'
      ? { status: 'processed', depositId: result.depositId }
      : { status: 'duplicate' };
  }
}
