// Stage 16 — exports worker. Materialises an Export row into a CSV/JSON
// file in S3 (under exports/<userId>/<exportId>.<ext>), records rowCount /
// fileUrl / fileSize, and sets a 7-day expiresAt.
import { Worker, type ConnectionOptions } from 'bullmq';
import {
  ExportStatus,
  type ExportType,
  type Prisma,
  type PrismaClient,
} from '@aiagg/db';
import type { WorkerStorage } from '../storage/storage';

const QUEUE = 'exports';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface JobData {
  exportId: string;
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

export interface ExportsProcessorHandle {
  worker: Worker<JobData>;
  close: () => Promise<void>;
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (typeof v === 'bigint') s = v.toString();
  else if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

function rowsToJson(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify(
    rows,
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

async function fetchRows(
  prisma: PrismaClient,
  type: ExportType,
  userId: string,
  filter: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  // `filter` is opaque — we accept simple {from,to} ISO strings.
  const from =
    typeof filter.from === 'string' ? new Date(filter.from) : undefined;
  const to = typeof filter.to === 'string' ? new Date(filter.to) : undefined;
  const where: Record<string, unknown> = { userId };
  if (from || to) {
    where.createdAt = { gte: from, lte: to };
  }
  const limit = 50_000;
  switch (type) {
    case 'TRANSACTIONS': {
      const items = await prisma.transaction.findMany({
        where: where as Prisma.TransactionWhereInput,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return items.map((t) => ({ ...t }));
    }
    case 'REQUESTS': {
      const items = await prisma.apiRequest.findMany({
        where: where as Prisma.ApiRequestWhereInput,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return items.map((t) => ({ ...t }));
    }
    case 'TASKS': {
      const items = await prisma.task.findMany({
        where: where as Prisma.TaskWhereInput,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return items.map((t) => ({ ...t }));
    }
    case 'DEPOSITS': {
      const items = await prisma.deposit.findMany({
        where: where as Prisma.DepositWhereInput,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return items.map((t) => ({ ...t }));
    }
    default:
      return [];
  }
}

export function createExportsWorker(opts: {
  redisUrl: string;
  prisma: PrismaClient;
  storage: WorkerStorage;
}): ExportsProcessorHandle {
  const connection = parseRedisUrl(opts.redisUrl);
  const { prisma, storage } = opts;

  const worker = new Worker<JobData>(
    QUEUE,
    async (job) => {
      const { exportId } = job.data;
      const row = await prisma.export.findUnique({ where: { id: exportId } });
      if (!row) return;
      if (row.status === ExportStatus.DONE) return;
      await prisma.export.update({
        where: { id: exportId },
        data: { status: ExportStatus.PROCESSING },
      });
      try {
        const rows = await fetchRows(
          prisma,
          row.type,
          row.userId,
          (row.filter ?? {}) as Record<string, unknown>,
        );
        const ext = row.format === 'json' ? 'json' : 'csv';
        const body =
          row.format === 'json' ? rowsToJson(rows) : rowsToCsv(rows);
        const key = `exports/${row.userId}/${row.id}.${ext}`;
        const buf = Buffer.from(body, 'utf8');
        const uploaded = await storage.upload({
          key,
          body: buf,
          contentType: ext === 'json' ? 'application/json' : 'text/csv',
        });
        await prisma.export.update({
          where: { id: exportId },
          data: {
            status: ExportStatus.DONE,
            rowCount: rows.length,
            fileUrl: uploaded.url,
            fileSize: BigInt(buf.length),
            expiresAt: new Date(Date.now() + TTL_MS),
            finishedAt: new Date(),
          },
        });
      } catch (err) {
        await prisma.export
          .update({
            where: { id: exportId },
            data: {
              status: ExportStatus.FAILED,
              error: (err instanceof Error ? err.message : String(err)).slice(
                0,
                1000,
              ),
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
        throw err;
      }
    },
    { connection, concurrency: 2 },
  );

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}
