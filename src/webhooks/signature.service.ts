import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Verifies HMAC-SHA256 webhook signatures.
 *
 * Security properties:
 *  - Signature is computed over the *raw* request bytes, not the re-serialized
 *    JSON. Re-serializing could change key order/whitespace and break the
 *    comparison (or worse, be manipulated). We must compare against exactly
 *    what the provider signed.
 *  - Comparison is constant-time (`timingSafeEqual`) to avoid leaking how many
 *    leading bytes matched via response-timing, which would let an attacker
 *    forge a signature byte-by-byte.
 */
@Injectable()
export class SignatureService {
  /**
   * @param rawBody  Exact bytes of the request body as received.
   * @param secret   Shared secret.
   * @returns hex-encoded HMAC-SHA256 digest.
   */
  sign(rawBody: Buffer | string, secret: string): string {
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  /**
   * Constant-time verification of a provided hex signature against the body.
   * Returns false on any malformed input rather than throwing, so callers can
   * treat "could not verify" and "did not match" identically (both => reject).
   */
  verify(
    rawBody: Buffer | string | undefined,
    providedSignature: string | undefined,
    secret: string,
  ): boolean {
    if (!rawBody || !providedSignature) {
      return false;
    }

    const expected = this.sign(rawBody, secret);

    // Compare as fixed-length hex buffers. If lengths differ, timingSafeEqual
    // throws — so we bail early. Length is not secret (it's the digest size),
    // so this early return leaks nothing useful.
    const expectedBuf = Buffer.from(expected, 'hex');
    let providedBuf: Buffer;
    try {
      providedBuf = Buffer.from(providedSignature, 'hex');
    } catch {
      return false;
    }

    if (expectedBuf.length === 0 || expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Validates that a webhook timestamp (Unix seconds) is within an allowed
   * window of the current time. Rejects both stale timestamps (replay of an
   * old capture) and timestamps far in the future (clock-skew abuse).
   */
  isTimestampFresh(
    unixTimestampSeconds: number,
    toleranceSeconds: number,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): boolean {
    if (!Number.isFinite(unixTimestampSeconds)) {
      return false;
    }
    return Math.abs(nowSeconds - unixTimestampSeconds) <= toleranceSeconds;
  }
}
