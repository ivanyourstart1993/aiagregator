// SystemSettingsService — Stage 14. Key/value store for runtime-mutable
// configuration. Backed by `system_setting` table; values are arbitrary JSON.
//
// Cached in-memory with 60s TTL per key for hot lookup paths (admit flow).
// `set()` invalidates the per-key cache and emits `setting.changed`.
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type SystemSetting } from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return (cached.value ?? fallback) as T;
    }
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = row ? (row.value as unknown) : undefined;
    this.cache.set(key, {
      value: value ?? null,
      expiresAt: now + CACHE_TTL_MS,
    });
    return (value ?? fallback) as T;
  }

  async bulkGet(keys: string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const missing: string[] = [];
    const now = Date.now();
    for (const k of keys) {
      const cached = this.cache.get(k);
      if (cached && cached.expiresAt > now) {
        out[k] = cached.value ?? null;
      } else {
        missing.push(k);
      }
    }
    if (missing.length > 0) {
      const rows = await this.prisma.systemSetting.findMany({
        where: { key: { in: missing } },
      });
      const byKey = new Map(rows.map((r) => [r.key, r.value as unknown]));
      for (const k of missing) {
        const v = byKey.get(k) ?? null;
        out[k] = v;
        this.cache.set(k, { value: v, expiresAt: now + CACHE_TTL_MS });
      }
    }
    return out;
  }

  async set(
    key: string,
    value: unknown,
    adminId: string,
    comment?: string,
  ): Promise<SystemSetting> {
    const row = await this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: value as Prisma.InputJsonValue,
        updatedById: adminId,
        ...(comment !== undefined ? { comment } : {}),
      },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        updatedById: adminId,
        comment: comment ?? null,
      },
    });
    this.cache.delete(key);
    this.events.emit('setting.changed', { key, value, adminId });
    return row;
  }

  async list(): Promise<SystemSetting[]> {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async getRaw(key: string): Promise<SystemSetting | null> {
    return this.prisma.systemSetting.findUnique({ where: { key } });
  }

  // Typed convenience helpers used by hot paths.
  async isPaused(key: string): Promise<boolean> {
    const v = await this.get<boolean>(key, false);
    return v === true;
  }
}
