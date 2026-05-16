/**
 * Sanitise a request body for storage in ApiErrorLog.requestBodyPreview.
 *
 * Two passes:
 *  1. Redact keys that look like credentials (api_key, token, secret, etc).
 *  2. Collapse strings longer than MAX_STRING to `<truncated: N chars>` so
 *     a 5 MB base64 payload doesn't bloat the DB row.
 *
 * Also clamps recursion depth (defence against pathological nested input)
 * and the final serialised size (defence against arrays of many medium
 * strings that pass MAX_STRING individually).
 */

const MAX_STRING = 200;
const MAX_DEPTH = 8;
const MAX_TOTAL_BYTES = 32 * 1024; // 32 KB after stringify

const REDACT_KEY_RE =
  /(api[_-]?key|secret|password|authorization|^auth$|bearer|token)/i;

type JsonLike = unknown;

function clipString(s: string): string {
  if (s.length <= MAX_STRING) return s;
  return `<truncated: ${s.length} chars>`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walk(v: JsonLike, depth: number): JsonLike {
  if (depth > MAX_DEPTH) return '<max-depth>';
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return clipString(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    return v.map((item) => walk(item, depth + 1));
  }
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (REDACT_KEY_RE.test(k)) {
        out[k] = '<redacted>';
        continue;
      }
      out[k] = walk(val, depth + 1);
    }
    return out;
  }
  // BigInt / Date / etc — stringify then clip.
  try {
    return clipString(String(v));
  } catch {
    return '<unserialisable>';
  }
}

export function sanitiseRequestBody(body: unknown): unknown {
  if (body === undefined || body === null) return null;
  const walked = walk(body, 0);
  // Final size guard: if even the walked value is enormous (e.g. 500 short
  // strings in an array), drop to a placeholder so Prisma doesn't OOM.
  try {
    const json = JSON.stringify(walked);
    if (json.length > MAX_TOTAL_BYTES) {
      return { _truncated: true, bytes: json.length, note: 'body too large for log' };
    }
    return walked;
  } catch {
    return { _truncated: true, note: 'body not JSON-serialisable' };
  }
}
