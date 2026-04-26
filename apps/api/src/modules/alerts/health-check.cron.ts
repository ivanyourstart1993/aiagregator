// HealthCheckCron — Stage 13. Every 2 minutes, evaluate a fixed set of
// system invariants and raise/auto-resolve Alerts via AlertsService.
//
// Conditions (each tied to a stable dedupeKey):
//   1. ProviderAccount.status in {EXCLUDED_BY_BILLING, INVALID_CREDENTIALS, BLOCKED}
//   2. Provider has 0 ACTIVE accounts
//   3. ProviderAccount near daily/monthly limit (>=90%)
//   4. Proxy.status=ERROR with recent lastErrorAt
//   5. ProviderAttempt failure rate >50% in last 1h
//   6. Generation queue waiting > 1000
//
// Auto-resolve: any OPEN alert whose dedupeKey is no longer produced by the
// current evaluation pass is marked RESOLVED.
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import {
  AlertCategory,
  AlertSeverity,
  ProviderAccountStatus,
  ProxyStatus,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GENERATION_QUEUE } from '../bullmq/queue.constants';
import { AlertsService, type RaiseAlertInput } from './alerts.service';

const HEALTH_PREFIXES = [
  'account:',
  'provider_no_accounts:',
  'account_quota:',
  'proxy_down:',
  'high_failure_rate:',
  'queue_backlog:',
];

const QUEUE_BACKLOG_THRESHOLD = 1000;
const FAILURE_RATE_THRESHOLD = 0.5;
const FAILURE_RATE_MIN_TOTAL = 10;
const QUOTA_WARN_RATIO = 0.9;
const PROXY_ERROR_RECENCY_MS = 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class HealthCheckCron {
  private readonly logger = new Logger(HealthCheckCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    @InjectQueue(GENERATION_QUEUE) private readonly genQueue: Queue,
  ) {}

  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.warn(
        `health-check tick failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  async runOnce(): Promise<void> {
    const raised: RaiseAlertInput[] = [];

    // 1. ProviderAccounts in bad statuses
    const badAccounts = await this.prisma.providerAccount.findMany({
      where: {
        status: {
          in: [
            ProviderAccountStatus.EXCLUDED_BY_BILLING,
            ProviderAccountStatus.INVALID_CREDENTIALS,
            ProviderAccountStatus.BLOCKED,
          ],
        },
      },
      select: {
        id: true,
        name: true,
        providerId: true,
        status: true,
        excludedReason: true,
        lastErrorMessage: true,
      },
    });
    for (const a of badAccounts) {
      const category =
        a.status === ProviderAccountStatus.EXCLUDED_BY_BILLING
          ? AlertCategory.ACCOUNT_BILLING
          : a.status === ProviderAccountStatus.INVALID_CREDENTIALS
          ? AlertCategory.ACCOUNT_INVALID_CREDENTIALS
          : AlertCategory.ACCOUNT_BLOCKED;
      raised.push({
        category,
        severity: AlertSeverity.CRITICAL,
        title: `ProviderAccount ${a.name} is ${a.status}`,
        message:
          a.excludedReason ?? a.lastErrorMessage ?? `Account is ${a.status}`,
        targetType: 'provider_account',
        targetId: a.id,
        dedupeKey: `account:${a.id}:status`,
        metadata: { providerId: a.providerId, status: a.status },
      });
    }

    // 2. Providers with no ACTIVE accounts
    const providers = await this.prisma.provider.findMany({
      select: { id: true, code: true, publicName: true },
    });
    for (const p of providers) {
      const count = await this.prisma.providerAccount.count({
        where: { providerId: p.id, status: ProviderAccountStatus.ACTIVE },
      });
      if (count === 0) {
        raised.push({
          category: AlertCategory.PROVIDER_NO_ACCOUNTS,
          severity: AlertSeverity.CRITICAL,
          title: `Provider ${p.code} has no available accounts`,
          message: `Provider ${p.publicName} (${p.code}) has 0 ACTIVE accounts. New requests for this provider will fail.`,
          targetType: 'provider',
          targetId: p.id,
          dedupeKey: `provider_no_accounts:${p.id}`,
          metadata: { providerCode: p.code },
        });
      }
    }

    // 3. ProviderAccount near limits
    const limited = await this.prisma.providerAccount.findMany({
      where: {
        OR: [
          { dailyLimit: { not: null } },
          { monthlyLimit: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        dailyLimit: true,
        monthlyLimit: true,
        todayRequestsCount: true,
        monthRequestsCount: true,
      },
    });
    for (const a of limited) {
      if (
        a.dailyLimit !== null &&
        a.todayRequestsCount >= Math.floor(a.dailyLimit * QUOTA_WARN_RATIO)
      ) {
        raised.push({
          category: AlertCategory.ACCOUNT_QUOTA,
          severity: AlertSeverity.WARNING,
          title: `Account ${a.name} near daily limit`,
          message: `${a.todayRequestsCount}/${a.dailyLimit} requests today (>=90%).`,
          targetType: 'provider_account',
          targetId: a.id,
          dedupeKey: `account_quota:${a.id}:daily`,
          metadata: {
            used: a.todayRequestsCount,
            limit: a.dailyLimit,
            scope: 'daily',
          },
        });
      }
      if (
        a.monthlyLimit !== null &&
        a.monthRequestsCount >= Math.floor(a.monthlyLimit * QUOTA_WARN_RATIO)
      ) {
        raised.push({
          category: AlertCategory.ACCOUNT_QUOTA,
          severity: AlertSeverity.WARNING,
          title: `Account ${a.name} near monthly limit`,
          message: `${a.monthRequestsCount}/${a.monthlyLimit} requests this month (>=90%).`,
          targetType: 'provider_account',
          targetId: a.id,
          dedupeKey: `account_quota:${a.id}:monthly`,
          metadata: {
            used: a.monthRequestsCount,
            limit: a.monthlyLimit,
            scope: 'monthly',
          },
        });
      }
    }

    // 4. Proxies with recent ERROR
    const since = new Date(Date.now() - PROXY_ERROR_RECENCY_MS);
    const badProxies = await this.prisma.proxy.findMany({
      where: {
        status: ProxyStatus.ERROR,
        lastErrorAt: { gt: since },
      },
      select: {
        id: true,
        name: true,
        host: true,
        lastErrorMessage: true,
      },
    });
    for (const p of badProxies) {
      raised.push({
        category: AlertCategory.PROXY_DOWN,
        severity: AlertSeverity.WARNING,
        title: `Proxy ${p.name} is in ERROR`,
        message: p.lastErrorMessage ?? `Proxy ${p.host} reported recent error.`,
        targetType: 'proxy',
        targetId: p.id,
        dedupeKey: `proxy_down:${p.id}`,
      });
    }

    // 5. Failure rate per provider in last 1h
    const failureSince = new Date(Date.now() - FAILURE_WINDOW_MS);
    const grouped = await this.prisma.providerAttempt.groupBy({
      by: ['providerId', 'status'],
      where: { startedAt: { gt: failureSince } },
      _count: { _all: true },
    });
    const tally = new Map<string, { total: number; failed: number }>();
    for (const row of grouped) {
      const key = row.providerId;
      const entry = tally.get(key) ?? { total: 0, failed: 0 };
      entry.total += row._count._all;
      if (row.status === 'failed') entry.failed += row._count._all;
      tally.set(key, entry);
    }
    for (const [providerId, { total, failed }] of tally.entries()) {
      if (total < FAILURE_RATE_MIN_TOTAL) continue;
      const ratio = failed / total;
      if (ratio > FAILURE_RATE_THRESHOLD) {
        raised.push({
          category: AlertCategory.HIGH_FAILURE_RATE,
          severity: AlertSeverity.CRITICAL,
          title: `High failure rate for provider ${providerId}`,
          message: `${failed}/${total} attempts failed in last 1h (${(
            ratio * 100
          ).toFixed(1)}%).`,
          targetType: 'provider',
          targetId: providerId,
          dedupeKey: `high_failure_rate:${providerId}`,
          metadata: { total, failed, ratio },
        });
      }
    }

    // 6. Generation queue backlog
    try {
      const counts = await this.genQueue.getJobCounts(
        'waiting',
        'active',
        'delayed',
      );
      const waiting = counts.waiting ?? 0;
      if (waiting > QUEUE_BACKLOG_THRESHOLD) {
        raised.push({
          category: AlertCategory.QUEUE_BACKLOG,
          severity: AlertSeverity.WARNING,
          title: `Generation queue backlog: ${waiting} waiting`,
          message: `${waiting} jobs waiting (threshold ${QUEUE_BACKLOG_THRESHOLD}).`,
          targetType: 'queue',
          targetId: GENERATION_QUEUE,
          dedupeKey: `queue_backlog:${GENERATION_QUEUE}`,
          metadata: counts as Record<string, unknown>,
        });
      }
    } catch (err) {
      this.logger.warn(
        `failed to read queue counts: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Apply raises
    const raisedKeys = new Set<string>();
    for (const r of raised) {
      raisedKeys.add(r.dedupeKey);
      try {
        await this.alerts.raise(r);
      } catch (err) {
        this.logger.warn(
          `failed to raise alert ${r.dedupeKey}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Auto-resolve previously-OPEN alerts whose condition no longer holds
    for (const prefix of HEALTH_PREFIXES) {
      const open = await this.alerts.listOpenDedupeKeysWithPrefix(prefix);
      for (const key of open) {
        if (!raisedKeys.has(key)) {
          await this.alerts.resolveByDedupeKey(key).catch(() => undefined);
        }
      }
    }
  }
}
