// Stage 16 — Exports service. Creates Export rows + enqueues a background
// job. The actual file generation runs in the worker (export.processor.ts)
// to avoid blocking the API thread on large queries.
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ExportStatus, ExportType, Prisma } from '@aiagg/db';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EXPORTS_QUEUE } from '../bullmq/queue.constants';

export interface CreateExportInput {
  userId: string;
  type: ExportType;
  format: 'csv' | 'json';
  filter: Record<string, unknown>;
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXPORTS_QUEUE) private readonly queue: Queue,
  ) {}

  async create(input: CreateExportInput): Promise<{ id: string }> {
    const row = await this.prisma.export.create({
      data: {
        userId: input.userId,
        type: input.type,
        format: input.format,
        filter: input.filter as Prisma.InputJsonValue,
        status: ExportStatus.PENDING,
      },
    });
    await this.queue.add(
      'generate',
      { exportId: row.id },
      {
        jobId: `export-${row.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
    return { id: row.id };
  }

  async list(userId: string): Promise<unknown[]> {
    const rows = await this.prisma.export.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toView(r));
  }

  async get(userId: string, id: string): Promise<unknown> {
    const row = await this.prisma.export.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    return this.toView(row);
  }

  private toView(r: {
    id: string;
    type: ExportType;
    format: string;
    status: ExportStatus;
    rowCount: number | null;
    fileUrl: string | null;
    fileSize: bigint | null;
    error: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    finishedAt: Date | null;
  }): unknown {
    return {
      id: r.id,
      type: r.type,
      format: r.format,
      status: r.status,
      rowCount: r.rowCount,
      fileUrl: r.fileUrl,
      fileSize: r.fileSize?.toString() ?? null,
      error: r.error,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    };
  }
}
