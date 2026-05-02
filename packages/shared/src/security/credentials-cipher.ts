// AES-256-GCM symmetric encryption for sensitive at-rest values
// (provider account credentials, etc.).
//
// KEK is provided via the CREDENTIALS_KEK env var. Accepts:
//   - base64 string ≥ 32 raw bytes (recommended: `openssl rand -base64 48`)
//   - hex string of exactly 64 chars (32 bytes)
//   - any other string ≥ 32 chars: SHA-256 it down to 32 bytes
//
// On-disk envelope (string) = "v1:" + base64url(iv(12) | tag(16) | ciphertext)
//
// Storage layout: a single string is stored as-is. For Json columns we wrap as
// `{ "v1": "<envelope>" }` so a JSON SELECT still returns an object and
// existing plaintext rows (objects with multiple keys, e.g. {apiKey: ...})
// continue to work — the read path detects the v1 envelope and decrypts it,
// otherwise returns the value untouched (backward-compat).
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const ENVELOPE_PREFIX = 'v1:';

let cachedKey: Buffer | undefined;
let cachedKekRaw: string | undefined;

function deriveKey(raw: string): Buffer {
  // Try base64 first.
  const trimmed = raw.trim();
  // Pure hex (64 chars)?
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  // base64 (allow padding tolerant)?
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length >= KEY_LEN) {
      return buf.subarray(0, KEY_LEN);
    }
  } catch { /* fallthrough */ }
  // Fallback: SHA-256(raw).
  if (trimmed.length < 32) {
    throw new Error('CREDENTIALS_KEK is too short (need ≥32 chars / 32-byte key)');
  }
  return createHash('sha256').update(trimmed).digest();
}

export function getCredentialsKek(): Buffer {
  const raw = process.env.CREDENTIALS_KEK;
  if (!raw) {
    throw new Error('CREDENTIALS_KEK env var is required for credentials encryption');
  }
  if (cachedKey && cachedKekRaw === raw) return cachedKey;
  cachedKey = deriveKey(raw);
  cachedKekRaw = raw;
  return cachedKey;
}

/** Encrypt a UTF-8 string and return the v1 envelope. */
export function encryptString(plaintext: string): string {
  const key = getCredentialsKek();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENVELOPE_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64url');
}

/** True iff the string looks like a v1 envelope produced by `encryptString`. */
export function isEnvelope(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX);
}

export function decryptString(envelope: string): string {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error('not a v1 envelope');
  }
  const buf = Buffer.from(envelope.slice(ENVELOPE_PREFIX.length), 'base64url');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('envelope too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const key = getCredentialsKek();
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Encrypt a credentials object for storage in a Json column. The object is
 * JSON-stringified, encrypted, and wrapped as `{ v1: "<envelope>" }` so a
 * Json column round-trips it cleanly and a plaintext row (any other object
 * shape) is trivially distinguishable on read.
 */
export function encryptJson(obj: Record<string, unknown>): { v1: string } {
  return { v1: encryptString(JSON.stringify(obj)) };
}

/**
 * Decrypt a credentials value. Backward-compat: if the value is a plain
 * object that doesn't look like a v1 envelope, return it as-is. This lets
 * code roll forward without a backfill migration.
 */
export function decryptJson(stored: unknown): Record<string, unknown> {
  if (stored == null) return {};
  if (typeof stored !== 'object') {
    // Could be an old code path that stored a raw envelope string.
    if (isEnvelope(stored)) {
      return JSON.parse(decryptString(stored)) as Record<string, unknown>;
    }
    return {};
  }
  const obj = stored as Record<string, unknown>;
  // v1 envelope wrapper: exactly one key 'v1' with envelope string.
  const keys = Object.keys(obj);
  if (keys.length === 1 && keys[0] === 'v1' && typeof obj.v1 === 'string' && isEnvelope(obj.v1)) {
    const decrypted = decryptString(obj.v1);
    return JSON.parse(decrypted) as Record<string, unknown>;
  }
  // Legacy plaintext — return as-is.
  return obj;
}

/** Safe constant-time comparison of two utf-8 strings of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still do a dummy compare to keep timing flat.
    const dummy = Buffer.alloc(ab.length);
    try { timingSafeEqual(ab, dummy); } catch { /* ignore */ }
    return false;
  }
  return timingSafeEqual(ab, bb);
}
