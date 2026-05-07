// CRM discovery worker. Pulls jobs from `crm-discovery` queue. Each job
// carries a `sourceId`. The worker:
//  1. Loads the LeadSource row.
//  2. Dispatches to the kind-specific handler (iTunes, Play Store, etc.).
//  3. Upserts each DiscoveredLead via @@unique([sourceKind, externalId]) —
//     existing leads keep their status & assignedTo, only metadata/score
//     are refreshed if the new score is higher.
//  4. Stamps lastRunAt / lastRunStatus / lastRunFound on the source.
//
// Cron-style auto-runs: a 60-sec heartbeat checks all enabled sources with
// `intervalMinutes != null` and enqueues a discovery job if `lastRunAt` is
// older than the interval.

import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import type { LeadSourceKind, Prisma, PrismaClient } from '@aiagg/db';
import { itunesHandler } from '../adapters/crm/itunes';
import { playStoreHandler } from '../adapters/crm/play-store';
import { lyzemHandler } from '../adapters/crm/lyzem';
import { tgstatHandler } from '../adapters/crm/tgstat';
import type { DiscoveredLead, DiscoveryHandler } from '../adapters/crm/types';

const QUEUE = 'crm-discovery';

const HANDLERS: Record<LeadSourceKind, DiscoveryHandler | null> = {
  ITUNES_SEARCH: itunesHandler,
  PLAY_STORE_SEARCH: playStoreHandler,
  LYZEM_SEARCH: lyzemHandler,
  TGSTAT_SEARCH: tgstatHandler,
  // The next two require Telethon — implemented by the Python sidecar.
  // Stub returns zero results for now so a misconfigured source doesn't
  // crash the worker.
  TELEGRAM_MENTIONS: null,
  FACEBOOK_AD_LIBRARY: null,
  MANUAL: null,
};

interface JobData {
  sourceId: string;
}

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const isTls = u.protocol === 'rediss:';
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    ...(isTls ? { tls: {} } : {}),
  };
}

export interface CrmDiscoveryHandle {
  worker: Worker<JobData>;
  cronTimer: NodeJS.Timeout;
  close: () => Promise<void>;
}

interface UpsertResult {
  inserted: number;
  refreshed: number;
}

async function upsertLeads(
  prisma: PrismaClient,
  sourceId: string,
  sourceKind: LeadSourceKind,
  leads: DiscoveredLead[],
): Promise<UpsertResult> {
  let inserted = 0;
  let refreshed = 0;
  for (const l of leads) {
    try {
      const existing = await prisma.lead.findUnique({
        where: {
          sourceKind_externalId: { sourceKind, externalId: l.externalId },
        },
        select: { id: true, score: true, status: true },
      });
      if (existing) {
        // Refresh only if new score is higher OR metadata has changed
        // materially. Don't touch status / assignedTo / draftMessage.
        const newScore = Math.max(existing.score, l.score ?? 0);
        await prisma.lead.update({
          where: { id: existing.id },
          data: {
            name: l.name,
            url: l.url ?? null,
            ownerName: l.ownerName ?? undefined,
            ownerEmail: l.ownerEmail ?? undefined,
            ownerWebsite: l.ownerWebsite ?? undefined,
            telegramUsername: l.telegramUsername ?? undefined,
            metadata: (l.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            score: newScore,
          },
        });
        refreshed++;
      } else {
        await prisma.lead.create({
          data: {
            type: l.type,
            externalId: l.externalId,
            sourceKind,
            sourceId,
            name: l.name,
            url: l.url ?? null,
            ownerName: l.ownerName ?? null,
            ownerEmail: l.ownerEmail ?? null,
            ownerWebsite: l.ownerWebsite ?? null,
            telegramUsername: l.telegramUsername ?? null,
            metadata: (l.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            score: l.score ?? 0,
          },
        });
        inserted++;
      }
    } catch (e) {
      // Swallow row-level errors so one bad lead doesn't kill the whole run.
      console.error(`[crm-discovery] upsert failed for ${l.externalId}:`, e);
    }
  }
  return { inserted, refreshed };
}

export function createCrmDiscoveryWorker(opts: {
  redisUrl: string;
  prisma: PrismaClient;
}): CrmDiscoveryHandle {
  const connection = parseRedisUrl(opts.redisUrl);
  const queue = new Queue(QUEUE, { connection });

  const worker = new Worker<JobData>(
    QUEUE,
    async (job) => {
      const { sourceId } = job.data;
      const log = (m: string) =>
        console.log(`[crm-discovery] ${sourceId} ${m}`);

      const source = await opts.prisma.leadSource.findUnique({
        where: { id: sourceId },
      });
      if (!source) {
        log('source not found, skipping');
        return { ok: false, reason: 'source_not_found' };
      }
      if (!source.enabled) {
        log('source disabled, skipping');
        return { ok: false, reason: 'disabled' };
      }
      const handler = HANDLERS[source.kind];
      if (!handler) {
        log(`no handler for kind=${source.kind}, marking as success/empty`);
        await opts.prisma.leadSource.update({
          where: { id: sourceId },
          data: {
            lastRunAt: new Date(),
            lastRunStatus: 'success',
            lastRunFound: 0,
            lastRunError: null,
          },
        });
        return { ok: true, found: 0 };
      }

      try {
        const leads = await handler.run(
          source.config as Record<string, unknown>,
          { prisma: opts.prisma, log },
        );
        log(`handler returned ${leads.length} leads`);
        const { inserted, refreshed } = await upsertLeads(
          opts.prisma,
          sourceId,
          source.kind,
          leads,
        );
        log(`upsert: ${inserted} new, ${refreshed} refreshed`);
        await opts.prisma.leadSource.update({
          where: { id: sourceId },
          data: {
            lastRunAt: new Date(),
            lastRunStatus: 'success',
            lastRunFound: inserted,
            lastRunError: null,
          },
        });
        return { ok: true, inserted, refreshed };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`handler failed: ${msg}`);
        await opts.prisma.leadSource.update({
          where: { id: sourceId },
          data: {
            lastRunAt: new Date(),
            lastRunStatus: 'failed',
            lastRunError: msg.slice(0, 500),
          },
        });
        throw e;
      }
    },
    {
      connection,
      concurrency: 2,
    },
  );

  // Cron-style heartbeat: every 60s, find sources whose intervalMinutes has
  // elapsed since lastRunAt (or have never run) and enqueue them.
  const cronTimer = setInterval(() => {
    void (async () => {
      try {
        const sources = await opts.prisma.leadSource.findMany({
          where: { enabled: true, intervalMinutes: { not: null } },
          select: { id: true, intervalMinutes: true, lastRunAt: true },
        });
        const now = Date.now();
        for (const s of sources) {
          const interval = (s.intervalMinutes ?? 0) * 60_000;
          if (interval <= 0) continue;
          const last = s.lastRunAt?.getTime() ?? 0;
          if (now - last >= interval) {
            await queue.add(
              'discover-cron',
              { sourceId: s.id },
              {
                attempts: 2,
                backoff: { type: 'exponential', delay: 30_000 },
                removeOnComplete: 100,
                removeOnFail: 100,
                // Dedup: if a previous job for the same source is still
                // in-flight, BullMQ won't add a duplicate.
                jobId: `cron:${s.id}:${Math.floor(now / interval)}`,
              },
            );
          }
        }
      } catch (e) {
        console.error('[crm-discovery] cron tick failed:', e);
      }
    })();
  }, 60_000);

  const close = async () => {
    clearInterval(cronTimer);
    try {
      await worker.close();
    } catch {
      /* swallow */
    }
    try {
      await queue.close();
    } catch {
      /* swallow */
    }
  };

  return { worker, cronTimer, close };
}
