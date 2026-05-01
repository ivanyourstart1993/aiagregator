import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatus } from '@aiagg/db';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TaskNotFoundError,
  TaskNotOwnedError,
  TaskResultNotReadyError,
} from '../../../common/errors/public-api.errors';
import type { TaskView } from '../dto/views';
import { sanitizeTaskError } from '@aiagg/shared';

interface PublicResultFile {
  id: string;
  url: string;
  mime_type: string;
  file_type: string;
  file_size: string;
  width: number | null;
  height: number | null;
  duration_seconds: string | null;
}

@Injectable()
export class TasksService {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.publicBaseUrl = (
      config.get<string>('PUBLIC_API_BASE_URL') ??
      config.get<string>('WEBHOOK_BASE_URL') ??
      'http://localhost:4000'
    ).replace(/\/+$/, '');
  }

  /**
   * Replace internal storage URLs (cluster-only MinIO host) with the public
   * /v1/files/:id proxy. We always emit the proxy URL so result hostnames
   * never leak to clients.
   */
  private toPublicResultFiles(
    files: Array<{
      id: string;
      mimeType: string;
      fileType: string;
      fileSize: bigint;
      width: number | null;
      height: number | null;
      durationSeconds: { toString(): string } | null;
    }>,
  ): PublicResultFile[] {
    return files.map((f) => ({
      id: f.id,
      url: `${this.publicBaseUrl}/v1/files/${f.id}`,
      mime_type: f.mimeType,
      file_type: f.fileType,
      file_size: f.fileSize.toString(),
      width: f.width,
      height: f.height,
      duration_seconds: f.durationSeconds ? f.durationSeconds.toString() : null,
    }));
  }

  async get(taskId: string, userId: string): Promise<TaskView> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        apiRequest: {
          select: {
            userId: true,
            bundleKey: true,
            clientPriceUnits: true,
            errorCode: true,
            errorMessage: true,
          },
        },
      },
    });
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.apiRequest.userId !== userId) throw new TaskNotOwnedError(taskId);

    const files =
      task.status === TaskStatus.SUCCEEDED
        ? await this.prisma.resultFile.findMany({
            where: { taskId: task.id },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              mimeType: true,
              fileType: true,
              fileSize: true,
              width: true,
              height: true,
              durationSeconds: true,
            },
          })
        : [];

    const sanitized = sanitizeTaskError(
      task.errorCode ?? task.apiRequest.errorCode,
      task.errorMessage ?? task.apiRequest.errorMessage,
    );
    return {
      id: task.id,
      status: task.status,
      mode: task.mode,
      bundle_key: task.apiRequest.bundleKey,
      reserved_amount: task.apiRequest.clientPriceUnits,
      result: task.resultData ?? undefined,
      result_files: files.length ? this.toPublicResultFiles(files) : undefined,
      error_code: sanitized.code,
      error_message: sanitized.message,
      created_at: task.createdAt,
      started_at: task.startedAt,
      finished_at: task.finishedAt,
    };
  }

  async getResult(
    taskId: string,
    userId: string,
  ): Promise<{
    success: true;
    task_id: string;
    status: TaskStatus;
    result: unknown;
    result_files: PublicResultFile[];
  }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { apiRequest: { select: { userId: true } } },
    });
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.apiRequest.userId !== userId) throw new TaskNotOwnedError(taskId);
    if (task.status !== TaskStatus.SUCCEEDED) {
      throw new TaskResultNotReadyError(taskId);
    }
    const files = await this.prisma.resultFile.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        mimeType: true,
        fileType: true,
        fileSize: true,
        width: true,
        height: true,
        durationSeconds: true,
      },
    });
    return {
      success: true,
      task_id: task.id,
      status: task.status,
      result: task.resultData,
      result_files: this.toPublicResultFiles(files),
    };
  }

  async listForUser(filter: {
    userId: string;
    status?: TaskStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: TaskView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 50));
    const where = filter.status
      ? { userId: filter.userId, status: filter.status }
      : { userId: filter.userId };
    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          apiRequest: {
            select: {
              bundleKey: true,
              clientPriceUnits: true,
              errorCode: true,
              errorMessage: true,
            },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    const succeededIds = rows.filter((r) => r.status === TaskStatus.SUCCEEDED).map((r) => r.id);
    const allFiles = succeededIds.length
      ? await this.prisma.resultFile.findMany({
          where: { taskId: { in: succeededIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            taskId: true,
            mimeType: true,
            fileType: true,
            fileSize: true,
            width: true,
            height: true,
            durationSeconds: true,
          },
        })
      : [];
    const filesByTask = new Map<string, typeof allFiles>();
    for (const f of allFiles) {
      const arr = filesByTask.get(f.taskId);
      if (arr) arr.push(f);
      else filesByTask.set(f.taskId, [f]);
    }

    const items = rows.map<TaskView>((task) => {
      const sanitized = sanitizeTaskError(
        task.errorCode ?? task.apiRequest.errorCode,
        task.errorMessage ?? task.apiRequest.errorMessage,
      );
      const files = filesByTask.get(task.id) ?? [];
      return {
        id: task.id,
        status: task.status,
        mode: task.mode,
        bundle_key: task.apiRequest.bundleKey,
        reserved_amount: task.apiRequest.clientPriceUnits,
        result: task.resultData ?? undefined,
        result_files: files.length ? this.toPublicResultFiles(files) : undefined,
        error_code: sanitized.code,
        error_message: sanitized.message,
        created_at: task.createdAt,
        started_at: task.startedAt,
        finished_at: task.finishedAt,
      };
    });
    return { items, total, page, pageSize };
  }
}
