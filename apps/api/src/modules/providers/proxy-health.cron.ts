// Stage 11 (full) — proxy health-check cron.
//
// Every 5 minutes we ping each non-disabled proxy via an HTTPS HEAD/GET to
// `https://www.google.com/generate_204` (returns 204) using `https-proxy-agent`.
// SOCKS5 proxies are skipped (would need a separate agent — Stage 12+).
//
// Behaviour:
//  * success → set ACTIVE, lastSuccessAt=now, latencyMs, externalIp(best-effort
//    via response Server header — not always available, so left null on the
//    google probe path), lastErrorMessage=null, errorStreak=0.
//  * fail → bump in-memory errorStreak; if cooldownAfterErrors threshold (or
//    DEFAULT_COOLDOWN_AFTER_ERRORS) is reached, flip status to COOLDOWN.
//  * COOLDOWN with last error older than COOLDOWN_RECOVER_MS (10 min) is
//    automatically retried by this cron — a successful tick promotes to
//    ACTIVE. So no separate "recover" pass is needed.
//
// The external-IP discovery path is intentionally separate to avoid hitting
// a third-party endpoint on every tick. Only run when the proxy still has
// no externalIp recorded (best-effort).
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProxyProtocol, ProxyStatus } from '@aiagg/db';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as http from 'node:http';
import * as https from 'node:https';
import { PrismaService } from '../../common/prisma/prisma.service';

const PROBE_URL = 'https://www.google.com/generate_204';
const IPIFY_URL = 'https://api.ipify.org?format=text';
const PROBE_TIMEOUT_MS = 8_000;
const DEFAULT_COOLDOWN_AFTER_ERRORS = 3;
const COOLDOWN_RECOVER_MS = 10 * 60 * 1000;

interface ProbeOutcome {
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}

@Injectable()
export class ProxyHealthCron {
  private readonly logger = new Logger(ProxyHealthCron.name);
  private running = false;
  // Per-proxy consecutive failure counter (lives in process memory only —
  // resets on container restart, which is acceptable for health hysteresis).
  private readonly failStreak = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/5 * * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.warn(
        `proxy-health tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<void> {
    const proxies = await this.prisma.proxy.findMany({
      where: {
        status: {
          in: [ProxyStatus.ACTIVE, ProxyStatus.ERROR, ProxyStatus.COOLDOWN],
        },
      },
    });
    for (const p of proxies) {
      try {
        // Skip SOCKS5 — https-proxy-agent doesn't support it; treat as no-op.
        if (p.protocol === ProxyProtocol.SOCKS5) {
          await this.prisma.proxy.update({
            where: { id: p.id },
            data: { lastCheckAt: new Date() },
          });
          continue;
        }
        // COOLDOWN auto-recovery: only retry if enough time has passed since
        // the last error, otherwise leave COOLDOWN as-is to limit traffic.
        if (
          p.status === ProxyStatus.COOLDOWN &&
          p.lastErrorAt &&
          Date.now() - p.lastErrorAt.getTime() < COOLDOWN_RECOVER_MS
        ) {
          continue;
        }
        const outcome = await this.probe(p);
        await this.recordOutcome(p, outcome);
      } catch (err) {
        this.logger.warn(
          `proxy ${p.id} probe error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async probe(p: {
    id: string;
    host: string;
    port: number;
    protocol: ProxyProtocol;
    login: string | null;
    passwordHash: string | null;
    externalIp: string | null;
  }): Promise<ProbeOutcome> {
    const auth =
      p.login && p.passwordHash
        ? `${encodeURIComponent(p.login)}:${encodeURIComponent(p.passwordHash)}@`
        : '';
    const scheme = p.protocol === ProxyProtocol.HTTPS ? 'https' : 'http';
    const proxyUrl = `${scheme}://${auth}${p.host}:${p.port}`;
    const agent = new HttpsProxyAgent(proxyUrl);
    const start = Date.now();
    try {
      const res = await this.fetchWithAgent(PROBE_URL, agent, PROBE_TIMEOUT_MS);
      const latencyMs = Date.now() - start;
      const ok = res.status >= 200 && res.status < 400;
      return { ok, latencyMs, status: res.status };
    } catch (err) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Minimal fetch-with-agent helper. Node's global fetch ignores `agent`,
  // so we use the underlying https module directly.
  private fetchWithAgent(
    targetUrl: string,
    agent: HttpsProxyAgent<string>,
    timeoutMs: number,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const u = new URL(targetUrl);
      const lib = u.protocol === 'http:' ? http : https;
      const req = lib.request(
        {
          method: 'GET',
          host: u.hostname,
          port: u.port || (u.protocol === 'http:' ? 80 : 443),
          path: u.pathname + u.search,
          agent,
          timeout: timeoutMs,
          headers: { 'User-Agent': 'aiagg-proxy-health/1.0' },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => {
            body += c;
            if (body.length > 4_000) body = body.slice(0, 4_000);
          });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body });
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('probe timeout'));
      });
      req.end();
    });
  }

  private async recordOutcome(
    p: {
      id: string;
      status: ProxyStatus;
      cooldownAfterErrors: number | null;
      externalIp: string | null;
    },
    outcome: ProbeOutcome,
  ): Promise<void> {
    const now = new Date();
    if (outcome.ok) {
      this.failStreak.delete(p.id);
      // Best-effort external-IP discovery on first success after a recovery.
      let externalIp = p.externalIp;
      if (!externalIp) {
        externalIp = await this.discoverIp(p.id).catch(() => null);
      }
      await this.prisma.proxy.update({
        where: { id: p.id },
        data: {
          status: ProxyStatus.ACTIVE,
          lastCheckAt: now,
          lastSuccessAt: now,
          latencyMs: outcome.latencyMs,
          lastErrorMessage: null,
          externalIp: externalIp ?? undefined,
        },
      });
      return;
    }
    const streak = (this.failStreak.get(p.id) ?? 0) + 1;
    this.failStreak.set(p.id, streak);
    const threshold = p.cooldownAfterErrors ?? DEFAULT_COOLDOWN_AFTER_ERRORS;
    const nextStatus: ProxyStatus =
      streak >= threshold ? ProxyStatus.COOLDOWN : ProxyStatus.ERROR;
    await this.prisma.proxy.update({
      where: { id: p.id },
      data: {
        status: nextStatus,
        lastCheckAt: now,
        lastErrorAt: now,
        lastErrorMessage: (outcome.error ?? `status=${outcome.status ?? 0}`).slice(
          0,
          500,
        ),
        latencyMs: outcome.latencyMs,
      },
    });
  }

  private async discoverIp(proxyId: string): Promise<string | null> {
    const p = await this.prisma.proxy.findUnique({ where: { id: proxyId } });
    if (!p) return null;
    if (p.protocol === ProxyProtocol.SOCKS5) return null;
    const auth =
      p.login && p.passwordHash
        ? `${encodeURIComponent(p.login)}:${encodeURIComponent(p.passwordHash)}@`
        : '';
    const scheme = p.protocol === ProxyProtocol.HTTPS ? 'https' : 'http';
    const proxyUrl = `${scheme}://${auth}${p.host}:${p.port}`;
    const agent = new HttpsProxyAgent(proxyUrl);
    try {
      const res = await this.fetchWithAgent(IPIFY_URL, agent, PROBE_TIMEOUT_MS);
      if (res.status >= 200 && res.status < 300) {
        const ip = res.body.trim();
        if (/^[0-9.]+$/.test(ip) && ip.length <= 45) return ip;
      }
    } catch {
      /* swallow — best-effort */
    }
    return null;
  }
}
