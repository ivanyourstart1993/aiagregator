import { Injectable } from '@nestjs/common';
import {
  type Currency,
  Prisma,
  type Transaction,
  TransactionStatus,
  type TransactionType,
} from '@aiagg/db';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import type { Paginated, TransactionView } from './dto/views';

export interface InsertTransactionInput {
  walletId: string;
  userId: string;
  type: TransactionType;
  status?: TransactionStatus;
  currency: Currency;
  amountUnits: bigint;
  balanceAfterUnits: bigint;
  reservedAfterUnits: bigint;
  reservationId?: string | null;
  depositId?: string | null;
  parentTransactionId?: string | null;
  taskId?: string | null;
  bundleKey?: string | null;
  pricingSnapshotId?: string | null;
  adminId?: string | null;
  description?: string | null;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey: string;
  idempotencyScope: string;
}

@Injectable()
export class TransactionRepository {
  async insert(tx: PrismaTx, input: InsertTransactionInput): Promise<Transaction> {
    return tx.transaction.create({
      data: {
        walletId: input.walletId,
        userId: input.userId,
        type: input.type,
        status: input.status ?? TransactionStatus.POSTED,
        currency: input.currency,
        amountUnits: input.amountUnits,
        balanceAfterUnits: input.balanceAfterUnits,
        reservedAfterUnits: input.reservedAfterUnits,
        reservationId: input.reservationId ?? null,
        depositId: input.depositId ?? null,
        parentTransactionId: input.parentTransactionId ?? null,
        taskId: input.taskId ?? null,
        bundleKey: input.bundleKey ?? null,
        pricingSnapshotId: input.pricingSnapshotId ?? null,
        adminId: input.adminId ?? null,
        description: input.description ?? null,
        metadata: input.metadata,
        idempotencyKey: input.idempotencyKey,
        idempotencyScope: input.idempotencyScope,
      },
    });
  }

  async list(
    tx: PrismaTx,
    where: Prisma.TransactionWhereInput,
    page: number,
    pageSize: number,
  ): Promise<Paginated<TransactionView>> {
    const skip = (Math.max(page, 1) - 1) * pageSize;
    const [items, total] = await Promise.all([
      tx.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      tx.transaction.count({ where }),
    ]);
    return {
      items: items.map((t) => this.toView(t)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(tx: PrismaTx, id: string): Promise<TransactionView | null> {
    const t = await tx.transaction.findUnique({ where: { id } });
    return t ? this.toView(t) : null;
  }

  toView(t: Transaction): TransactionView {
    return {
      id: t.id,
      walletId: t.walletId,
      userId: t.userId,
      type: t.type,
      status: t.status,
      currency: t.currency,
      amountUnits: t.amountUnits,
      balanceAfterUnits: t.balanceAfterUnits,
      reservedAfterUnits: t.reservedAfterUnits,
      reservationId: t.reservationId,
      depositId: t.depositId,
      parentTransactionId: t.parentTransactionId,
      taskId: t.taskId,
      bundleKey: t.bundleKey,
      pricingSnapshotId: t.pricingSnapshotId,
      adminId: t.adminId,
      description: t.description,
      metadata: t.metadata,
      idempotencyKey: t.idempotencyKey,
      idempotencyScope: t.idempotencyScope,
      createdAt: t.createdAt,
    };
  }
}
