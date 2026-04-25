import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@aiagg/db';
import { PrismaService } from '../prisma/prisma.service';
import type { PrismaTx } from '../prisma/prisma.types';

export interface IdempotencyOptions {
  /** Run inside an existing transaction instead of opening a new one. */
  tx?: PrismaTx;
  /** Status to record alongside the response payload (defaults to 200). */
  status?: number;
}

interface CachedRecord<T> {
  responseJson: T;
  responseStatus: number;
  fromCache: true;
}

/**
 * Generic idempotency wrapper backed by `idempotency_record` table.
 *
 * Contract:
 *   1. First step inside the (current or new) tx is INSERT row with empty payload.
 *   2. On unique-violation (P2002) — fetch the row and return its cached response.
 *   3. Otherwise run `fn(tx)`, then UPDATE the same row with serialised result.
 *
 * The cached response is typed as T — caller is responsible for type stability
 * across versions of the same scope.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    scope: string,
    key: string,
    fn: (tx: PrismaTx) => Promise<T>,
    options: IdempotencyOptions = {},
  ): Promise<T> {
    if (options.tx) {
      return this.runInside(scope, key, fn, options.tx, options.status ?? 200);
    }
    return this.prisma.$transaction(
      async (tx) => this.runInside(scope, key, fn, tx as PrismaTx, options.status ?? 200),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async runInside<T>(
    scope: string,
    key: string,
    fn: (tx: PrismaTx) => Promise<T>,
    tx: PrismaTx,
    status: number,
  ): Promise<T> {
    // Step 1: try to claim the (scope, key) by inserting a placeholder row.
    try {
      await tx.idempotencyRecord.create({
        data: {
          scope,
          key,
          responseJson: {} as Prisma.InputJsonValue,
          responseStatus: 0,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Duplicate — fetch existing cached response.
        const existing = await tx.idempotencyRecord.findUnique({
          where: { scope_key: { scope, key } },
        });
        if (!existing) {
          // Extremely unlikely race: insert race lost but row not yet visible.
          throw err;
        }
        this.logger.debug(`idempotent replay for ${scope}/${key}`);
        return existing.responseJson as unknown as T;
      }
      throw err;
    }

    // Step 2: run the actual operation.
    const result = await fn(tx);

    // Step 3: persist the response.
    await tx.idempotencyRecord.update({
      where: { scope_key: { scope, key } },
      data: {
        responseJson: this.serialise(result),
        responseStatus: status,
      },
    });

    return result;
  }

  /**
   * Cheap read: returns cached response if present, undefined otherwise.
   * Does NOT claim the key. Useful for pure replay-checks before doing work.
   */
  async peek<T>(scope: string, key: string): Promise<CachedRecord<T> | undefined> {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (!row || row.responseStatus === 0) return undefined;
    return {
      responseJson: row.responseJson as unknown as T,
      responseStatus: row.responseStatus,
      fromCache: true,
    };
  }

  private serialise(value: unknown): Prisma.InputJsonValue {
    // Convert BigInt → string recursively so the JSON column accepts it. We
    // intentionally do not deep-clone Date objects; Prisma JSON serialiser
    // handles those natively.
    const replaced = JSON.parse(
      JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    ) as Prisma.InputJsonValue;
    return replaced;
  }
}
