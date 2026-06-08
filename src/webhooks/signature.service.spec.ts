import { createHmac } from 'node:crypto';
import { SignatureService } from './signature.service';

describe('SignatureService', () => {
  const service = new SignatureService();
  const secret = 'test_secret_at_least_16_chars_long';
  const rawBody = JSON.stringify({
    userId: 'u1',
    amount: 100,
    currency: 'USD',
  });

  const validSig = (body: string, key = secret): string =>
    createHmac('sha256', key).update(body).digest('hex');

  describe('verify', () => {
    it('accepts a correct signature over the exact raw body', () => {
      expect(service.verify(rawBody, validSig(rawBody), secret)).toBe(true);
    });

    it('rejects when the body was tampered with after signing', () => {
      const tampered = rawBody.replace('100', '100000');
      expect(service.verify(tampered, validSig(rawBody), secret)).toBe(false);
    });

    it('rejects a signature produced with the wrong secret', () => {
      const forged = validSig(rawBody, 'attacker_guess_secret_16chars__');
      expect(service.verify(rawBody, forged, secret)).toBe(false);
    });

    it('rejects a missing signature', () => {
      expect(service.verify(rawBody, undefined, secret)).toBe(false);
      expect(service.verify(rawBody, '', secret)).toBe(false);
    });

    it('rejects a missing raw body', () => {
      expect(service.verify(undefined, validSig(rawBody), secret)).toBe(false);
    });

    it('rejects a malformed (non-hex / wrong-length) signature without throwing', () => {
      expect(service.verify(rawBody, 'not-hex-zzzz', secret)).toBe(false);
      expect(service.verify(rawBody, 'abcd', secret)).toBe(false);
    });

    it('works on a Buffer body identically to a string body', () => {
      const buf = Buffer.from(rawBody, 'utf8');
      expect(service.verify(buf, validSig(rawBody), secret)).toBe(true);
    });
  });

  describe('isTimestampFresh', () => {
    const now = 1_700_000_000;

    it('accepts a timestamp within tolerance', () => {
      expect(service.isTimestampFresh(now - 10, 300, now)).toBe(true);
    });

    it('rejects a stale timestamp (replay of an old capture)', () => {
      expect(service.isTimestampFresh(now - 3600, 300, now)).toBe(false);
    });

    it('rejects a timestamp too far in the future', () => {
      expect(service.isTimestampFresh(now + 3600, 300, now)).toBe(false);
    });

    it('rejects a non-finite timestamp', () => {
      expect(service.isTimestampFresh(Number.NaN, 300, now)).toBe(false);
    });
  });
});
