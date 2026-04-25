import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@aiagg/db';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TaskNotFoundError,
  TaskNotOwnedError,
  TaskResultNotReadyError,
} from '../../../common/errors/public-api.errors';
import type { TaskView } from '../dto/views';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      id: task.id,
      status: task.status,
      mode: task.mode,
      bundle_key: task.apiRequest.bundleKey,
      reserved_amount: task.apiRequest.clientPriceUnits,
      result: task.resultData ?? undefined,
      result_files: task.resultFiles ?? undefined,
      error_code: task.errorCode ?? task.apiRequest.errorCode ?? null,
      error_message: task.errorMessage ?? task.apiRequest.errorMessage ?? null,
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
    result_files: unknown;
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
    return {
      success: true,
      task_id: task.id,
      status: task.status,
      result: task.resultData,
      result_files: task.resultFiles,
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
    const items = rows.map<TaskView>((task) => ({
      id: task.id,
      status: task.status,
      mode: task.mode,
      bundle_key: task.apiRequest.bundleKey,
      reserved_amount: task.apiRequest.clientPriceUnits,
      result: task.resultData ?? undefined,
      result_files: task.resultFiles ?? undefined,
      error_code: task.errorCode ?? task.apiRequest.errorCode ?? null,
      error_message: task.errorMessage ?? task.apiRequest.errorMessage ?? null,
      created_at: task.createdAt,
      started_at: task.startedAt,
      finished_at: task.finishedAt,
    }));
    return { items, total, page, pageSize };
  }
}
