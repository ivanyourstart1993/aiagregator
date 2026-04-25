import { Injectable } from '@nestjs/common';
import { Currency, Prisma, WalletKind } from '@aiagg/db';
import type { PrismaTx } from '../../common/prisma/prisma.types';

export interface WalletRow {
  id: string;
  userId: string;
  currency: Currency;
  kind: WalletKind;
  availableUnits: bigint;
  reservedUnits: bigint;
  version: number;
}

interface RawWalletRow {
  id: string;
  user_id: string;
  currency: Currency;
  kind: WalletKind;
  available_units: bigint;
  reserved_units: bigint;
  version: number;
}

function map(row: RawWalletRow): WalletRow {
  return {
    id: row.id,
    userId: row.user_id,
    currency: row.currency,
    kind: row.kind,
    availableUnits: row.available_units,
    reservedUnits: row.reserved_units,
    version: row.version,
  };
}

/**
 * Wallet table I/O. All mutations expect to run inside a Prisma interactive
 * transaction so that `SELECT ... FOR UPDATE` row locks are honored until
 * commit. We rely on the Postgres `wallet_userId_currency_kind_key` unique
 * constraint to detect concurrent ensures.
 */
@Injectable()
export class WalletRepository {
  /**
   * Acquire a per-row write-lock on the wallet for `(userId, currency, kind)`.
   * Returns null if the wallet does not yet exist; caller is responsible for
   * creating it with `createIfMissing` (also lock-respecting).
   */
  async lockForUpdate(
    tx: PrismaTx,
    userId: string,
    currency: Currency = Currency.USD,
    kind: WalletKind = WalletKind.MAIN,
  ): Promise<WalletRow | null> {
    const rows = await tx.$queryRaw<RawWalletRow[]>(Prisma.sql`
      SELECT id, "userId" AS user_id, currency, kind,
             "availableUnits" AS available_units,
             "reservedUnits"  AS reserved_units,
             version
        FROM wallet
       WHERE "userId" = ${userId}
         AND currency = ${currency}::"Currency"
         AND kind     = ${kind}::"WalletKind"
       FOR UPDATE
    `);
    if (rows.length === 0) return null;
    const head = rows[0];
    if (!head) return null;
    return map(head);
  }

  /**
   * Lock-or-create. Locks the row if present; otherwise creates and reads back
   * (no FOR UPDATE on insert path — the row has just been inserted by us so we
   * already own the most recent version). Safe to call repeatedly.
   */
  async lockOrCreate(
    tx: PrismaTx,
    userId: string,
    currency: Currency = Currency.USD,
    kind: WalletKind = WalletKind.MAIN,
  ): Promise<WalletRow> {
    const existing = await this.lockForUpdate(tx, userId, currency, kind);
    if (existing) return existing;
    // Insert; on race-loss (P2002), retry the lock.
    try {
      const created = await tx.wallet.create({
        data: { userId, currency, kind },
        select: {
          id: true,
          userId: true,
          currency: true,
          kind: true,
          availableUnits: true,
          reservedUnits: true,
          version: true,
        },
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const retried = await this.lockForUpdate(tx, userId, currency, kind);
        if (retried) return retried;
      }
      throw err;
    }
  }

  /**
   * Optimistic-locking update. Bumps `version` and `updatedAt` only if the
   * incoming `version` matches stored value. Returns the updated row.
   * Throws on version mismatch (caller should treat as race and abort tx).
   */
  async update(
    tx: PrismaTx,
    walletId: string,
    expectedVersion: number,
    newAvailable: bigint,
    newReserved: bigint,
  ): Promise<WalletRow> {
    const updated = await tx.$queryRaw<RawWalletRow[]>(Prisma.sql`
      UPDATE wallet
         SET "availableUnits" = ${newAvailable},
             "reservedUnits"  = ${newReserved},
             version          = version + 1,
             "updatedAt"      = NOW()
       WHERE id = ${walletId}
         AND version = ${expectedVersion}
       RETURNING id,
                 "userId" AS user_id,
                 currency,
                 kind,
                 "availableUnits" AS available_units,
                 "reservedUnits"  AS reserved_units,
                 version
    `);
    const head = updated[0];
    if (!head) {
      throw new Error(
        `Wallet ${walletId} version mismatch (expected ${expectedVersion}); concurrent update detected`,
      );
    }
    return map(head);
  }
}
