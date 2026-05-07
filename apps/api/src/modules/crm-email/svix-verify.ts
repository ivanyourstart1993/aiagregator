// Minimal Svix-style HMAC verification for Resend webhooks.
// We don't pull in `svix` SDK — single function is 30 lines and avoids the
// dependency.
//
// Resend webhook headers: `svix-id`, `svix-timestamp`, `svix-signature`.
// Signature format: `v1,<base64-hmac>` (multiple comma-separated tokens
// allowed, we accept if any matches).
//
// Secret format from Resend dashboard: `whsec_<base64>` — strip prefix.

import { createHmac, timingSafeEqual } from 'node:crypto';

interface VerifyArgs {
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
  rawBody: string; // exact string body received
  secret: string; // either `whsec_xxx` or raw base64
  // Reject events older than this many seconds (replay window). Default 5min.
  toleranceSeconds?: number;
}

export function verifyResendWebhook(args: VerifyArgs): boolean {
  const { svixId, svixTimestamp, svixSignature, rawBody, secret } = args;
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

  // Replay protection
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const tolerance = args.toleranceSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > tolerance) return false;

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'base64');

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes)
    .update(signedPayload)
    .digest('base64');

  for (const token of svixSignature.split(' ')) {
    const [version, sig] = token.split(',');
    if (version !== 'v1' || !sig) continue;
    if (sig.length !== expected.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
    } catch {
      /* fallthrough */
    }
  }
  return false;
}
