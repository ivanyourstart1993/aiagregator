/**
 * Disposable / throwaway email domains blocked at signup.
 *
 * The welcome bonus grants real spendable credit, so a throwaway inbox is the
 * cheapest way to farm it. This is a pragmatic curated set of the highest-volume
 * temp-mail providers — not exhaustive (a full list is thousands of domains and
 * churns constantly), but it stops the obvious ones. Extend as abuse shows up.
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'sharklasers.com',
  'grr.la',
  '10minutemail.com',
  '10minutemail.net',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'getnada.com',
  'nada.email',
  'dispostable.com',
  'yopmail.com',
  'yopmail.net',
  'trashmail.com',
  'trashmail.de',
  'mailnesia.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mohmal.com',
  'emailondeck.com',
  'moakt.com',
  'mytemp.email',
  'tmail.ws',
  'tmails.net',
  'spam4.me',
  'mailcatch.com',
  'inboxkitten.com',
  'burnermail.io',
  'discard.email',
  'discardmail.com',
  'anonaddy.me',
  'mailsac.com',
  'temp-mail.io',
  'minuteinbox.com',
  'luxusmail.org',
  'wildmail.com',
  '1secmail.com',
  '1secmail.org',
  '1secmail.net',
  'vjuum.com',
  'laafd.com',
]);

/** Domain part of an email, lower-cased. Empty string if malformed. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase().trim();
}

/**
 * True if the address uses a known disposable/throwaway provider. Matches the
 * domain itself AND any subdomain of it — many temp-mail hosts (mailinator,
 * 1secmail, …) accept arbitrary subdomains (`farm@x.mailinator.com`), so an
 * exact-Set check alone is trivially bypassed.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain.endsWith('.' + blocked)) return true;
  }
  return false;
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Canonical form of an email for one-real-inbox deduplication (used to key the
 * one-time welcome bonus so plus-tag / dot aliases can't farm it). Strips
 * `+tag` subaddressing for every provider, and for Gmail also removes local-part
 * dots and folds googlemail.com → gmail.com — all of which deliver to the same
 * inbox. NOT for account uniqueness (that stays on the raw address); only for
 * "has this human already been granted the bonus".
 */
export function canonicalEmail(email: string): string {
  const lower = email.toLowerCase().trim();
  const at = lower.lastIndexOf('@');
  if (at < 0) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}
