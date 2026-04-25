import { Injectable } from '@nestjs/common';
import {
  type Currency,
  Prisma,
  type Reservation,
  ReservationStatus,
} from '@aiagg/db';
import type { PrismaTx } from '../../common/prisma/prisma.types';

export interface CreateReservationInput {
  userId: string;
  walletId: string;
  currency: Currency;
  amountUnits: bigint;
  expiresAt: Date;
  idempotencyKey: string;
  taskId?: string | null;
  bundleKey?: string | null;
  pricingSnapshotId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ReservationRepository {
  async create(tx: PrismaTx, input: CreateReservationInput): Promise<Reservation> {
    return tx.reservation.create({
      data: {
        userId: input.userId,
        walletId: input.walletId,
        currency: input.currency,
        amountUnits: input.amountUnits,
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        taskId: input.taskId ?? null,
        bundleKey: input.bundleKey ?? null,
        pricingSnapshotId: input.pricingSnapshotId ?? null,
        metadata: input.metadata,
      },
    });
  }

  async findByIdempotencyKey(tx: PrismaTx, key: string): Promise<Reservation | null> {
    return tx.reservation.findUnique({ where: { idempotencyKey: key } });
  }

  async findById(tx: PrismaTx, id: string): Promise<Reservation | null> {
    return tx.reservation.findUnique({ where: { id } });
  }

  async markCaptured(
    tx: PrismaTx,
    id: string,
    capturedUnits: bigint,
  ): Promise<Reservation> {
    return tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.CAPTURED,
        capturedUnits,
        capturedAt: new Date(),
      },
    });
  }

  async markReleased(tx: PrismaTx, id: string): Promise<Reservation> {
    return tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  async markExpired(tx: PrismaTx, id: string): Promise<Reservation> {
    return tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.EXPIRED,
        releasedAt: new Date(),
      },
    });
  }

  /**
   * Finds PENDING reservations whose `expiresAt` is in the past.
   * Used by the maintenance cron job.
   */
  async findStale(tx: PrismaTx, limit = 100): Promise<Reservation[]> {
    return tx.reservation.findMany({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
  }
}
