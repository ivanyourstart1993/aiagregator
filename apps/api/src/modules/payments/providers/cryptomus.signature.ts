import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Cryptomus uses the following signature scheme on both directions:
 *   sign = md5(base64(JSON.stringify(payloadWithoutSign)) + API_KEY)
 *
 * - JSON encoding is the request body verbatim (with sorted keys not required by their docs).
 * - Base64 is the standard alphabet (no URL-safe substitution).
 * - md5 hex digest, lowercase.
 */

export function buildCryptomusSignature(payload: unknown, apiKey: string): string {
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  return createHash('md5')
    .update(base64 + apiKey)
    .digest('hex');
}

/**
 * Constant-time signature compare. Both signatures must be hex-encoded MD5
 * (32 chars). On length mismatch returns false without leaking timing info.
 */
export function verifyCryptomusSignature(
  payloadWithoutSign: unknown,
  signFromPayload: string,
  apiKey: string,
): boolean {
  const expected = buildCryptomusSignature(payloadWithoutSign, apiKey);
  if (expected.length !== signFromPayload.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signFromPayload));
  } catch {
    return false;
  }
}
