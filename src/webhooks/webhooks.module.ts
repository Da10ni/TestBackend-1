import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, SignatureService, WebhookSignatureGuard],
  exports: [SignatureService],
})
export class WebhooksModule {}
