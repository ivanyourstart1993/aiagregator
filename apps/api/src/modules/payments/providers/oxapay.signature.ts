import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * OxaPay signs webhook deliveries with HMAC-SHA512 of the raw request body
 * using the merchant API key as the secret. The signature is sent in the
 * `hmac` header as a lowercase hex string.
 */

export function buildOxapaySignature(rawBody: string, merchantKey: string): string {
  return createHmac('sha512', merchantKey).update(rawBody, 'utf8').digest('hex');
}

export function verifyOxapaySignature(
  rawBody: string,
  signFromHeader: string,
  merchantKey: string,
): boolean {
  if (!signFromHeader || !merchantKey) return false;
  const expected = buildOxapaySignature(rawBody, merchantKey);
  const got = signFromHeader.trim().toLowerCase();
  if (expected.length !== got.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}
