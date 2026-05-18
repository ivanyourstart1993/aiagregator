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

const BATCH_LIMIT = 1000;

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
    let deleted = 0;
    let failed = 0;
    for (const f of due) {
      try {
        await this.storage.delete(f.storageKey);
        await this.prisma.resultFile.update({
          where: { id: f.id },
          data: {
            status: ResultFileStatus.DELETED,
            deletedAt: new Date(),
          },
        });
        deleted += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `failed to delete result file ${f.id} (${f.storageKey}): ${message}`,
        );
        await this.prisma.resultFile
          .update({
            where: { id: f.id },
            data: { status: ResultFileStatus.DELETION_FAILED },
          })
          .catch(() => undefined);
        await this.alerts
          .raise({
            category: AlertCategory.STORAGE_FULL,
            severity: AlertSeverity.WARNING,
            title: `Failed to delete expired result file`,
            message: `ResultFile ${f.id} (${f.storageKey}) deletion failed: ${message}`,
            targetType: 'result_file',
            targetId: f.id,
            dedupeKey: `file_deletion_failed:${f.id}`,
            metadata: { storageKey: f.storageKey, error: message },
          })
          .catch(() => undefined);
      }
    }
    this.logger.log(
      `Cleanup: tried ${due.length}, deleted ${deleted}, failed ${failed}`,
    );
    return { tried: due.length, deleted, failed };
  }
}
