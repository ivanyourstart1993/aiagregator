// AlertsService — Stage 13. Centralised system alert raising / acknowledging /
// resolving. Alerts are deduplicated by `dedupeKey`: re-raising an OPEN alert
// bumps `metadata.count` + `updatedAt`; an ACK/RESOLVED alert is re-opened
// when the underlying condition fires again.
import { Injectable, Logger } from '@nestjs/common';
import {
  AlertCategory,
  AlertSeverity,
  AlertStatus,
  Prisma,
  type Alert,
} from '@aiagg/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RaiseAlertInput {
  category: AlertCategory;
  severity?: AlertSeverity;
  title: string;
  message: string;
  targetType?: string | null;
  targetId?: string | null;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export interface ListAlertsFilter {
  status?: AlertStatus;
  severity?: AlertSeverity;
  category?: AlertCategory;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async raise(input: RaiseAlertInput): Promise<Alert> {
    const severity = input.severity ?? AlertSeverity.WARNING;
    const baseMeta: Record<string, unknown> = {
      ...(input.metadata ?? {}),
    };

    const existing = await this.prisma.alert.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });

    if (existing && existing.status === AlertStatus.OPEN) {
      const prevMeta =
        (existing.metadata as Record<string, unknown> | null) ?? {};
      const count =
        typeof prevMeta.count === 'number' ? prevMeta.count + 1 : 2;
      const merged: Record<string, unknown> = {
        ...prevMeta,
        ...baseMeta,
        count,
        lastAt: new Date().toISOString(),
      };
      return this.prisma.alert.update({
        where: { id: existing.id },
        data: {
          severity,
          title: input.title,
          message: input.message,
          targetType: input.targetType ?? existing.targetType,
          targetId: input.targetId ?? existing.targetId,
          metadata: merged as Prisma.InputJsonValue,
        },
      });
    }

    if (existing) {
      // Was ACK or RESOLVED — re-open.
      return this.prisma.alert.update({
        where: { id: existing.id },
        data: {
          status: AlertStatus.OPEN,
          severity,
          title: input.title,
          message: input.message,
          targetType: input.targetType ?? existing.targetType,
          targetId: input.targetId ?? existing.targetId,
          acknowledgedAt: null,
          acknowledgedById: null,
          resolvedAt: null,
          metadata: {
            ...baseMeta,
            count: 1,
            reopenedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return this.prisma.alert.create({
      data: {
        category: input.category,
        severity,
        status: AlertStatus.OPEN,
        title: input.title,
        message: input.message,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        dedupeKey: input.dedupeKey,
        metadata: { ...baseMeta, count: 1 } as Prisma.InputJsonValue,
      },
    });
  }

  async acknowledge(id: string, adminId: string): Promise<Alert> {
    return this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedById: adminId,
        acknowledgedAt: new Date(),
      },
    });
  }

  async resolve(id: string): Promise<Alert> {
    return this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  async resolveByDedupeKey(dedupeKey: string): Promise<Alert | null> {
    const existing = await this.prisma.alert.findUnique({
      where: { dedupeKey },
    });
    if (!existing) return null;
    if (existing.status === AlertStatus.RESOLVED) return existing;
    return this.prisma.alert.update({
      where: { id: existing.id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  async list(filter: ListAlertsFilter): Promise<{
    items: Alert[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.AlertWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.severity) where.severity = filter.severity;
    if (filter.category) where.category = filter.category;
    const [items, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<Alert | null> {
    return this.prisma.alert.findUnique({ where: { id } });
  }

  async listOpenDedupeKeysWithPrefix(prefix: string): Promise<string[]> {
    const rows = await this.prisma.alert.findMany({
      where: {
        status: AlertStatus.OPEN,
        dedupeKey: { startsWith: prefix },
      },
      select: { dedupeKey: true },
    });
    return rows.map((r) => r.dedupeKey);
  }
}
