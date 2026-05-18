// FileCleanupCron — Stage 15. Daily at 03:00 server time, sweep ResultFile
// rows whose `expiresAt` is past and which are still AVAILABLE; delete the
// underlying object from MinIO and mark the row DELETED. On storage failure,
// mark DELETION_FAILED and raise an alert (deduped per file id).
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertCategory, AlertSeverity, ResultFileStatus } from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AlertsService } from '../alerts/alerts.service';

// Per-tick cap. Cron runs once daily, so even with peak ~1k uploads/hour we
// need headroom — 1000 was the original Stage 15 guess and proved tight in
// May 2026 when 9k expired files piled up and the cron took 9+ days to
// drain. Raised to 5000; the inner loop runs one S3 DeleteObjects per
// 500-batch (DeleteObjects caps at 1000 per call but smaller batches keep
// per-iteration latency low).
const BATCH_LIMIT = 5000;
const DELETE_CHUNK = 500;

// Playground input uploads land under `playground/<userId>/...` and never get
// a ResultFile row, so the ResultFile-driven sweep below misses them. Most
// orphan storage on prod is this prefix — users re-upload the same source
// image dozens of times during a session. 1-day matches the result TTL.
const INPUT_PREFIX = 'playground/';
const INPUT_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FileCleanupCron {
  private readonly logger = new Logger(FileCleanupCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly alerts: AlertsService,
  ) {}

  @Cron('0 3 * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
      await this.sweepInputUploads();
    } catch (err) {
      this.logger.warn(
        `file-cleanup tick failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  // Sweep orphan input uploads under `playground/*` — no DB record, so we
  // walk S3 directly by prefix and delete anything older than INPUT_TTL_MS.
  // S3 DeleteObjects caps at 1000 keys per request; we batch accordingly.
  async sweepInputUploads(): Promise<{ scanned: number; deleted: number; failed: number }> {
    const cutoff = new Date(Date.now() - INPUT_TTL_MS);
    let scanned = 0;
    let deleted = 0;
    let failed = 0;
    for await (const batch of this.storage.listObjectsByPrefix(INPUT_PREFIX)) {
      scanned += batch.length;
      const stale = batch
        .filter((o) => o.lastModified < cutoff)
        .map((o) => o.key);
      if (stale.length === 0) continue;
      // S3 DeleteObjects accepts up to 1000 per call; listObjectsByPrefix
      // already caps page size at 1000, so a single call per page is safe.
      try {
        const res = await this.storage.deleteMany(stale);
        deleted += res.deleted;
        failed += res.failed;
      } catch (err) {
        failed += stale.length;
        this.logger.warn(
          `input-sweep batch delete failed (${stale.length} keys): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    this.logger.log(
      `Input-sweep ${INPUT_PREFIX}: scanned ${scanned}, deleted ${deleted}, failed ${failed}`,
    );
    return { scanned, deleted, failed };
  }

  async runOnce(): Promise<{ tried: number; deleted: number; failed: number }> {
    const now = new Date();
    const due = await this.prisma.resultFile.findMany({
      where: {
        status: ResultFileStatus.AVAILABLE,
        expiresAt: { lt: now },
      },
      take: BATCH_LIMIT,
      orderBy: { expiresAt: 'asc' },
      select: { id: true, storageKey: true },
    });
    if (due.length === 0) {
      this.logger.log('Cleanup: nothing to do');
      return { tried: 0, deleted: 0, failed: 0 };
    }
    let deleted = 0;
    let failed = 0;
    // Chunked bulk delete. Original per-file path made N S3 + N DB round-trips,
    // which capped throughput at ~10/sec and let backlogs stretch over days.
    // DeleteObjects + updateMany cuts that to 2 round-trips per chunk.
    for (let i = 0; i < due.length; i += DELETE_CHUNK) {
      const chunk = due.slice(i, i + DELETE_CHUNK);
      try {
        const res = await this.storage.deleteMany(chunk.map((f) => f.storageKey));
        // S3 DeleteObjects in Quiet mode only echoes errors. We don't have a
        // per-key mapping here, so on partial failure mark the whole chunk as
        // DELETION_FAILED — the next tick will retry. In practice S3 either
        // succeeds for all keys or returns a global error.
        if (res.failed === 0) {
          await this.prisma.resultFile.updateMany({
            where: { id: { in: chunk.map((f) => f.id) } },
            data: { status: ResultFileStatus.DELETED, deletedAt: new Date() },
          });
          deleted += chunk.length;
        } else {
          await this.prisma.resultFile.updateMany({
            where: { id: { in: chunk.map((f) => f.id) } },
            data: { status: ResultFileStatus.DELETION_FAILED },
          });
          failed += chunk.length;
          await this.raiseChunkAlert(chunk, `${res.failed} of ${chunk.length} keys failed`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `chunk delete failed (${chunk.length} files): ${message}`,
        );
        failed += chunk.length;
        await this.prisma.resultFile
          .updateMany({
            where: { id: { in: chunk.map((f) => f.id) } },
            data: { status: ResultFileStatus.DELETION_FAILED },
          })
          .catch(() => undefined);
        await this.raiseChunkAlert(chunk, message);
      }
    }
    this.logger.log(
      `Cleanup: tried ${due.length}, deleted ${deleted}, failed ${failed}`,
    );
    return { tried: due.length, deleted, failed };
  }

  private async raiseChunkAlert(
    chunk: Array<{ id: string; storageKey: string }>,
    message: string,
  ): Promise<void> {
    const sample = chunk[0];
    if (!sample) return;
    await this.alerts
      .raise({
        category: AlertCategory.STORAGE_FULL,
        severity: AlertSeverity.WARNING,
        title: `Failed to delete expired result files (batch)`,
        message: `Batch of ${chunk.length} files starting at ${sample.id} (${sample.storageKey}) failed: ${message}`,
        targetType: 'result_file',
        targetId: sample.id,
        dedupeKey: `file_deletion_failed:batch:${sample.id}`,
        metadata: { sampleKey: sample.storageKey, batchSize: chunk.length, error: message },
      })
      .catch(() => undefined);
  }
}
