// SSRF-safe HTTP fetcher.
//
// Resolves the target hostname before connecting and rejects any address that
// falls inside private/loopback/link-local/CGNAT/multicast/cloud-metadata
// ranges. Re-resolves and re-checks on every redirect to defeat DNS rebinding
// (the resolver could return a public IP first and a private one on the next
// hop). Caps response size, total time, and redirect count.
//
// Configured by env vars:
//   SSRF_FETCH_MAX_BYTES   default 25 MiB
//   SSRF_FETCH_TIMEOUT_MS  default 30_000
//   SSRF_FETCH_MAX_REDIRECTS default 3
//   SSRF_EXTRA_ALLOW       comma-separated list of host names or IPv4 CIDRs to
//                          permit even if they would normally be blocked
//                          (use sparingly — e.g. a known internal addon host).
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 3;

export interface SafeFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** Override env-driven max bytes for this call. */
  maxBytes?: number;
  /** Override env-driven timeout for this call. */
  timeoutMs?: number;
  /** Override env-driven max redirects for this call. */
  maxRedirects?: number;
  /** Disallow non-default ports (anything outside 80/443/8080/8443). Default false. */
  strictPorts?: boolean;
  /** Optional AbortSignal to compose with the internal timeout. */
  signal?: AbortSignal;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  url: string;
}

export class SsrfBlockedError extends Error {
  readonly code = 'ssrf_blocked';
  constructor(reason: string) {
    super(`SSRF-blocked: ${reason}`);
    this.name = 'SsrfBlockedError';
  }
}

export class SafeFetchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SafeFetchError';
  }
}

// IPv4 ranges to block. Each is [networkInt, prefixLen].
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],          // current network
  ['10.0.0.0', 8],          // RFC 1918 private
  ['100.64.0.0', 10],       // CGNAT
  ['127.0.0.0', 8],         // loopback
  ['169.254.0.0', 16],      // link-local + cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],       // RFC 1918 private
  ['192.0.0.0', 24],        // IETF protocol assignments
  ['192.0.2.0', 24],        // TEST-NET-1
  ['192.168.0.0', 16],      // RFC 1918 private
  ['198.18.0.0', 15],       // benchmarking
  ['198.51.100.0', 24],     // TEST-NET-2
  ['203.0.113.0', 24],      // TEST-NET-3
  ['224.0.0.0', 4],         // multicast
  ['240.0.0.0', 4],         // reserved (incl. 255.255.255.255)
];

function v4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return -1;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isInV4Cidr(ip: string, cidrIp: string, prefix: number): boolean {
  const addr = v4ToInt(ip);
  const net = v4ToInt(cidrIp);
  if (addr < 0 || net < 0) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (addr & mask) === (net & mask);
}

function isPrivateV4(ip: string): boolean {
  return BLOCKED_V4.some(([net, prefix]) => isInV4Cidr(ip, net, prefix));
}

function isPrivateV6(ip: string): boolean {
  // Normalise via Node's URL by way of canonical form is overkill; do a textual
  // check that catches the common offenders. node:net's `isIP` already
  // confirmed it parses, so we operate on the lowercased string.
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;       // unspecified, loopback
  if (v.startsWith('fe80:') || v.startsWith('fe80::')) return true;  // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true;          // unique-local
  if (v.startsWith('ff')) return true;                                // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — extract and check as v4.
  const mapped = /^::ffff:([0-9.]+)$/.exec(v);
  if (mapped && mapped[1]) return isPrivateV4(mapped[1]);
  // IPv4-compatible (::a.b.c.d) — same idea.
  const compat = /^::([0-9.]+)$/.exec(v);
  if (compat && compat[1]) return isPrivateV4(compat[1]);
  return false;
}

interface ParsedAllowEntry {
  kind: 'host' | 'cidr';
  host?: string;       // lowercase
  cidrIp?: string;
  prefix?: number;
}

function parseExtraAllow(raw: string | undefined): ParsedAllowEntry[] {
  if (!raw) return [];
  const out: ParsedAllowEntry[] = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const slash = part.indexOf('/');
    if (slash > 0) {
      const ip = part.slice(0, slash);
      const prefix = Number(part.slice(slash + 1));
      if (isIP(ip) === 4 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
        out.push({ kind: 'cidr', cidrIp: ip, prefix });
      }
    } else {
      out.push({ kind: 'host', host: part.toLowerCase() });
    }
  }
  return out;
}

function isHostAllowed(host: string, allow: ParsedAllowEntry[]): boolean {
  return allow.some((e) => e.kind === 'host' && e.host === host.toLowerCase());
}

function isIpAllowed(ip: string, allow: ParsedAllowEntry[]): boolean {
  return allow.some(
    (e) => e.kind === 'cidr' && e.cidrIp && e.prefix !== undefined && isInV4Cidr(ip, e.cidrIp, e.prefix),
  );
}

function readEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Resolve the URL's hostname through DNS and reject anything pointing at a
 * blocked IP range, unless explicitly allowed by SSRF_EXTRA_ALLOW.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`invalid url: ${rawUrl.slice(0, 100)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`disallowed protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  if (!host) throw new SsrfBlockedError('empty hostname');

  const allow = parseExtraAllow(process.env.SSRF_EXTRA_ALLOW);
  // Hostname allowlist short-circuits DNS check (operator opt-in).
  if (isHostAllowed(host, allow)) return parsed;

  // If the URL already contains a literal IP, check it directly.
  const literalKind = isIP(host);
  if (literalKind === 4) {
    if (!isPrivateV4(host) || isIpAllowed(host, allow)) return parsed;
    throw new SsrfBlockedError(`private IPv4: ${host}`);
  }
  if (literalKind === 6) {
    // Normalise (URL hostnames keep brackets sometimes).
    const v6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (!isPrivateV6(v6)) return parsed;
    throw new SsrfBlockedError(`private IPv6: ${v6}`);
  }

  // Hostname — resolve. Use {all:true} to catch any rebinder returning multiple
  // records where one resolves into a private range.
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dnsLookup(host, { all: true });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new SsrfBlockedError(`DNS lookup failed for ${host}: ${m}`);
  }
  if (addrs.length === 0) throw new SsrfBlockedError(`no DNS records for ${host}`);

  for (const a of addrs) {
    if (a.family === 4) {
      if (isPrivateV4(a.address) && !isIpAllowed(a.address, allow)) {
        throw new SsrfBlockedError(`hostname ${host} resolves to private IPv4 ${a.address}`);
      }
    } else if (a.family === 6) {
      if (isPrivateV6(a.address)) {
        throw new SsrfBlockedError(`hostname ${host} resolves to private IPv6 ${a.address}`);
      }
    }
  }
  return parsed;
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/**
 * Synchronous URL safety check used at request-submit time (no DNS).
 *
 * Catches: bad scheme, bad port, literal private/loopback/link-local IP in
 * hostname. Does NOT defend against DNS rebinding — that's enforced at
 * delivery time by `safeFetch` / `assertSafeUrl`.
 *
 * Returns null on success, or a short reason string on rejection.
 */
export function checkUrlShape(
  rawUrl: string,
  opts: { allowedPorts?: number[]; allowHttp?: boolean } = {},
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'invalid url';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `disallowed protocol: ${parsed.protocol}`;
  }
  if (parsed.protocol === 'http:' && opts.allowHttp === false) {
    return 'http scheme not allowed (use https)';
  }
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80;
  const allowed = opts.allowedPorts ?? Array.from(ALLOWED_PORTS);
  if (!allowed.includes(port)) {
    return `disallowed port: ${port}`;
  }
  const host = parsed.hostname;
  if (!host) return 'empty hostname';
  if (host.toLowerCase() === 'localhost') return 'localhost not allowed';
  const literalKind = isIP(host);
  if (literalKind === 4) {
    if (isPrivateV4(host)) return `private IPv4: ${host}`;
  } else if (literalKind === 6) {
    const v6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (isPrivateV6(v6)) return `private IPv6: ${v6}`;
  }
  return null;
}

function checkPort(parsed: URL, strict: boolean): void {
  if (!strict) return;
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new SsrfBlockedError(`disallowed port: ${port}`);
  }
}

/**
 * SSRF-safe fetch. Manually follows redirects so each hop is re-validated.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  const maxBytes = opts.maxBytes ?? readEnvInt('SSRF_FETCH_MAX_BYTES', DEFAULT_MAX_BYTES);
  const timeoutMs = opts.timeoutMs ?? readEnvInt('SSRF_FETCH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const maxRedirects =
    opts.maxRedirects ?? readEnvInt('SSRF_FETCH_MAX_REDIRECTS', DEFAULT_MAX_REDIRECTS);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  if (opts.signal) {
    const onAbort = () => ac.abort();
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  let currentUrl = rawUrl;
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const parsed = await assertSafeUrl(currentUrl);
      checkPort(parsed, opts.strictPorts ?? false);

      const res = await fetch(parsed.toString(), {
        method: opts.method ?? 'GET',
        headers: opts.headers,
        body: opts.body,
        redirect: 'manual',
        signal: ac.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) {
          // No Location header — treat as terminal.
          return await readBodyCapped(res, parsed.toString(), maxBytes);
        }
        if (hop === maxRedirects) {
          throw new SafeFetchError('too_many_redirects', `redirect cap (${maxRedirects}) hit at ${parsed.toString()}`);
        }
        currentUrl = new URL(loc, parsed).toString();
        continue;
      }
      return await readBodyCapped(res, parsed.toString(), maxBytes);
    }
    throw new SafeFetchError('too_many_redirects', `redirect cap (${maxRedirects}) hit`);
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyCapped(
  res: Response,
  finalUrl: string,
  maxBytes: number,
): Promise<SafeFetchResponse> {
  // Pre-flight content-length check.
  const cl = res.headers.get('content-length');
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > maxBytes) {
      throw new SafeFetchError(
        'response_too_large',
        `content-length ${n} exceeds cap ${maxBytes}`,
      );
    }
  }
  if (!res.body) {
    return {
      status: res.status,
      headers: collectHeaders(res),
      body: new Uint8Array(),
      url: finalUrl,
    };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* ignore */ }
        throw new SafeFetchError(
          'response_too_large',
          `response body exceeded cap ${maxBytes} bytes`,
        );
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return {
    status: res.status,
    headers: collectHeaders(res),
    body: merged,
    url: finalUrl,
  };
}

function collectHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

/**
 * Convenience helper used by adapters that need `{ data: base64, mimeType }`.
 */
export async function safeFetchAsBase64(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ data: string; mimeType: string }> {
  const res = await safeFetch(rawUrl, opts);
  if (res.status < 200 || res.status >= 300) {
    throw new SafeFetchError(
      'upstream_status',
      `upstream returned ${res.status} for ${rawUrl}`,
    );
  }
  const mimeType = res.headers['content-type']?.split(';')[0]?.trim() || 'application/octet-stream';
  return { data: Buffer.from(res.body).toString('base64'), mimeType };
}
