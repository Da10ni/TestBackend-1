import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SignatureService } from './signature.service';

/**
 * Authenticates incoming webhooks BEFORE the controller / validation pipe runs.
 *
 * Order of checks (cheap & non-secret first, then crypto):
 *   1. raw body present (rawBody:true must be enabled on the app)
 *   2. X-Timestamp present, numeric, and fresh   -> blocks stale replays
 *   3. X-Signature present and HMAC matches (constant-time) -> authenticity
 *
 * On any failure we throw a generic 401 with no detail about *why* — we don't
 * tell a probing attacker whether it was the timestamp or the signature.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(
    private readonly signatureService: SignatureService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const rawBody = req.rawBody;
    const signature = this.headerValue(req.headers['x-signature']);
    const timestampHeader = this.headerValue(req.headers['x-timestamp']);

    if (!rawBody || !signature || !timestampHeader) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const tolerance = this.config.get<number>(
      'WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS',
      300,
    );
    const timestamp = Number(timestampHeader);
    if (!this.signatureService.isTimestampFresh(timestamp, tolerance)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const secret = this.config.get<string>('WEBHOOK_SECRET', '');
    const valid = this.signatureService.verify(rawBody, signature, secret);
    if (!valid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }

  /** Express header values may be string | string[] | undefined. */
  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
