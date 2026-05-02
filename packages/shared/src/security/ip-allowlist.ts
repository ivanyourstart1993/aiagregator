// IP allowlist matcher used by webhook controllers.
//
// Each allowlist entry is either:
//   - a literal IPv4 address (`1.2.3.4`) — strict equality
//   - an IPv4 CIDR (`1.2.3.0/24`) — prefix match
//
// Bug we're closing: previous code did `subject.includes(allowed)` which
// substring-matches `'11.2.3.40'.includes('1.2.3.4')` → false-positive.
import { isIP } from 'node:net';

interface AllowEntry {
  kind: 'ip' | 'cidr';
  ip?: string;       // for kind='ip': the literal IP
  cidrIp?: string;   // for kind='cidr': network IP
  prefix?: number;   // for kind='cidr': prefix length
}

function v4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return -1;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function parseAllowlist(csv: string): AllowEntry[] {
  const out: AllowEntry[] = [];
  for (const part of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
    const slash = part.indexOf('/');
    if (slash > 0) {
      const ip = part.slice(0, slash);
      const prefix = Number(part.slice(slash + 1));
      if (isIP(ip) === 4 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
        out.push({ kind: 'cidr', cidrIp: ip, prefix });
      }
    } else if (isIP(part) === 4 || isIP(part) === 6) {
      out.push({ kind: 'ip', ip: part });
    }
  }
  return out;
}

/**
 * True iff `subject` matches any entry in the comma-separated allowlist.
 * Empty / whitespace-only allowlist returns `false` — caller decides whether
 * an empty allowlist should be treated as "open" or "closed".
 *
 * Trims an IPv6-mapped-IPv4 prefix (`::ffff:1.2.3.4` → `1.2.3.4`) from
 * `subject` before comparison so `req.ip` from a dual-stack listener
 * matches a v4 entry.
 */
export function isIpAllowed(subject: string, csvAllowlist: string): boolean {
  if (!subject || !csvAllowlist) return false;
  const entries = parseAllowlist(csvAllowlist);
  if (entries.length === 0) return false;

  let s = subject.trim();
  // Strip IPv6-mapped-IPv4 prefix.
  const mapped = /^::ffff:([0-9.]+)$/i.exec(s);
  if (mapped && mapped[1]) s = mapped[1];

  const subjectInt = isIP(s) === 4 ? v4ToInt(s) : -1;

  for (const e of entries) {
    if (e.kind === 'ip' && e.ip === s) return true;
    if (e.kind === 'cidr' && e.cidrIp && e.prefix !== undefined && subjectInt >= 0) {
      const netInt = v4ToInt(e.cidrIp);
      if (netInt < 0) continue;
      const prefix = e.prefix;
      if (prefix === 0) return true;
      const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
      if ((subjectInt & mask) === (netInt & mask)) return true;
    }
  }
  return false;
}
