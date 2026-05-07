// Signed unsubscribe token. Format: `<deliveryId>.<hmacSha256(deliveryId, secret)>`.
//
// Why HMAC instead of UUID lookup:
//  - Stateless verification — no DB hit on every link click crawl from
//    Outlook/Gmail SafeLinks (which preview every link in the email).
//  - Token can't be guessed without the secret.
//  - Rotating the secret invalidates ALL existing unsubscribe links — never
//    rotate unless absolutely necessary (it'd nuke compliance for old emails).

import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(deliveryId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(deliveryId)
    .digest('base64url');
}

export function makeUnsubscribeToken(deliveryId: string, secret: string): string {
  return `${deliveryId}.${sign(deliveryId, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): { deliveryId: string } | null {
  const idx = token.lastIndexOf('.');
  if (idx <= 0 || idx >= token.length - 1) return null;
  const deliveryId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(deliveryId, secret);
  // Length-equal compare via timingSafeEqual; if lengths differ short-circuit
  // to avoid Buffer mismatch crash.
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return { deliveryId };
}
