// Stage 11 (full) — provider account health-check cron.
//
// Every 10 minutes we re-test accounts that the worker has parked into
// EXCLUDED_BY_BILLING, INVALID_CREDENTIALS, or COOLDOWN. If the adapter's
// optional `validateAccount(creds, proxy)` reports `ok: true`, we promote
// the account back to ACTIVE so the worker can resume rotation. Statuses
// that imply human intervention (BLOCKED, MANUALLY_DISABLED) are skipped —
// the admin must re-enable explicitly.
//
// QUOTA_EXHAUSTED is also tested: provider quotas reset on schedules we don't
// always know, so a successful probe is a good signal that the quota window
// has cleared.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProviderAccountStatus, ProxyStatus } from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdapterRegistry } from './adapters/adapter-registry';

const RECOVERABLE_STATUSES: ProviderAccountStatus[] = [
  ProviderAccountStatus.EXCLUDED_BY_BILLING,
  ProviderAccountStatus.INVALID_CREDENTIALS,
  ProviderAccountStatus.COOLDOWN,
  ProviderAccountStatus.QUOTA_EXHAUSTED,
];

@Injectable()
export class AccountHealthCron {
  private readonly logger = new Logger(AccountHealthCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AdapterRegistry,
  ) {}

  @Cron('*/10 * * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.warn(
        `account-health tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<void> {
    const accounts = await this.prisma.providerAccount.findMany({
      where: { status: { in: RECOVERABLE_STATUSES } },
      include: { provider: true },
    });
    for (const a of accounts) {
      try {
        // Find any adapter implementing validateAccount for this provider.
        const adapter = this.registry
          .list()
          .find(
            (x) =>
              x.providerCode === a.provider.code &&
              typeof x.validateAccount === 'function',
          );
        if (!adapter || !adapter.validateAccount) continue;
        let proxyCtx:
          | {
              host: string;
              port: number;
              protocol: 'HTTP' | 'HTTPS' | 'SOCKS5';
              login?: string;
              password?: string;
            }
          | undefined;
        if (a.proxyId) {
          const p = await this.prisma.proxy.findUnique({
            where: { id: a.proxyId },
          });
          if (p && p.status === ProxyStatus.ACTIVE) {
            proxyCtx = {
              host: p.host,
              port: p.port,
              protocol: p.protocol,
              login: p.login ?? undefined,
              password: p.passwordHash ?? undefined,
            };
          }
        }
        const result = await adapter.validateAccount(
          (a.credentials ?? {}) as Record<string, unknown>,
          proxyCtx,
        );
        if (result.ok) {
          await this.prisma.providerAccount.update({
            where: { id: a.id },
            data: {
              status: ProviderAccountStatus.ACTIVE,
              excludedReason: null,
              lastErrorMessage: null,
            },
          });
          this.logger.log(
            `account ${a.id} (${a.provider.code}) recovered → ACTIVE`,
          );
        } else if (result.reason) {
          await this.prisma.providerAccount.update({
            where: { id: a.id },
            data: {
              lastErrorMessage: result.reason.slice(0, 1000),
              lastErrorAt: new Date(),
            },
          });
        }
      } catch (err) {
        this.logger.warn(
          `account ${a.id} validate failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
