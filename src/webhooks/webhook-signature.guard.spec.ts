import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { SignatureService } from './signature.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';

describe('WebhookSignatureGuard', () => {
  const secret = 'guard_test_secret_16_chars_min__';
  const tolerance = 300;
  let guard: WebhookSignatureGuard;

  const config = {
    get: (key: string, def?: unknown) => {
      if (key === 'WEBHOOK_SECRET') return secret;
      if (key === 'WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS') return tolerance;
      return def;
    },
  } as unknown as ConfigService;

  beforeEach(() => {
    guard = new WebhookSignatureGuard(new SignatureService(), config);
  });

  const contextFor = (
    rawBody: Buffer | undefined,
    headers: Record<string, string | undefined>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ rawBody, headers }),
      }),
    }) as unknown as ExecutionContext;

  const sign = (body: string): string =>
    createHmac('sha256', secret).update(body).digest('hex');

  const now = (): string => String(Math.floor(Date.now() / 1000));

  it('allows a request with a valid signature and fresh timestamp', () => {
    const body = JSON.stringify({ userId: 'u1', amount: 1 });
    const ctx = contextFor(Buffer.from(body), {
      'x-signature': sign(body),
      'x-timestamp': now(),
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when the signature header is missing', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const ctx = contextFor(Buffer.from(body), { 'x-timestamp': now() });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects when the raw body is missing (rawBody not captured)', () => {
    const ctx = contextFor(undefined, {
      'x-signature': sign('{}'),
      'x-timestamp': now(),
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a stale timestamp even if the signature is valid', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const stale = String(Math.floor(Date.now() / 1000) - tolerance - 60);
    const ctx = contextFor(Buffer.from(body), {
      'x-signature': sign(body),
      'x-timestamp': stale,
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const body = JSON.stringify({ userId: 'u1', amount: 1 });
    const ctx = contextFor(Buffer.from(body.replace('1', '999')), {
      'x-signature': sign(body),
      'x-timestamp': now(),
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
