import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  Currency,
  Prisma,
  type Reservation,
  ReservationStatus,
  type Transaction,
  TransactionType,
  type Wallet,
  WalletKind,
} from '@aiagg/db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import type { PrismaTx } from '../../common/prisma/prisma.types';
import {
  InsufficientBalanceError,
  ReservationNotFoundError,
  ReservationStateError,
  WalletNotFoundError,
} from '../../common/errors/billing.errors';
import { WalletRepository } from './wallet.repository';
import { TransactionRepository } from './transaction.repository';
import { ReservationRepository } from './reservation.repository';
import type { BalanceView, Paginated, TransactionView, WalletView } from './dto/views';

const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 min
const STALE_RESERVATION_SCAN_INTERVAL_MS = 60 * 1000; // 1 min

const SCOPE = {
  CREDIT: 'wallet.credit',
  DEBIT: 'wallet.debit',
  CORRECT: 'wallet.correct',
  BONUS: 'wallet.bonus',
  RESERVE: 'reservation.create',
  CAPTURE: 'reservation.capture',
  RELEASE: 'reservation.release',
  EXPIRE: 'reservation.expire',
} as const;

export interface CreditInput {
  userId: string;
  amountUnits: bigint;
  currency?: Currency;
  type?: TransactionType; // DEPOSIT | CORRECTION | BONUS_GRANT — default DEPOSIT
  description?: string;
  reason?: string;
  idempotencyKey?: string;
  idempotencyScope?: string;
  depositId?: string;
  parentTransactionId?: string;
  taskId?: string;
  bundleKey?: string;
  adminId?: string;
  metadata?: Record<string, unknown>;
  /** Optional: run within an existing transaction (e.g. webhook handler). */
  tx?: PrismaTx;
}

export interface DebitInput {
  userId: string;
  amountUnits: bigint;
  currency?: Currency;
  description?: string;
  reason?: string;
  idempotencyKey?: string;
  idempotencyScope?: string;
  taskId?: string;
  bundleKey?: string;
  adminId?: string;
  metadata?: Record<string, unknown>;
  tx?: PrismaTx;
}

export interface CorrectInput {
  userId: string;
  /** Signed: positive credits, negative debits. */
  amountUnits: bigint;
  currency?: Currency;
  description?: string;
  reason?: string;
  idempotencyKey?: string;
  idempotencyScope?: string;
  /** Default true for admin-initiated corrections. */
  allowNegative?: boolean;
  adminId?: string;
  metadata?: Record<string, unknown>;
  tx?: PrismaTx;
}

export interface BonusInput {
  userId: string;
  amountUnits: bigint;
  currency?: Currency;
  description?: string;
  reason?: string;
  idempotencyKey?: string;
  adminId?: string;
  metadata?: Record<string, unknown>;
  tx?: PrismaTx;
}

export interface ReserveInput {
  userId: string;
  amountUnits: bigint;
  idempotencyKey: string;
  currency?: Currency;
  expiresAt?: Date;
  taskId?: string;
  bundleKey?: string;
  /**
   * Optional pricing snapshot id (Stage 3+). If provided, the snapshot id is
   * stored on the Reservation and on the RESERVATION_HOLD transaction so that
   * historical operations remain immutable across price changes.
   */
  pricingSnapshotId?: string;
  metadata?: Record<string, unknown>;
  tx?: PrismaTx;
}

export interface CaptureResult {
  reservation: Reservation;
  transaction: Transaction;
}

export interface ReleaseResult {
  reservation: Reservation;
  transaction: Transaction;
}

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private staleScanTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly walletRepo: WalletRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly reservationRepo: ReservationRepository,
  ) {}

  onModuleInit(): void {
    // Lightweight in-process expiry sweeper for dev. Production deployments
    // would replace this with a BullMQ repeatable job (see plan); ranking
    // simplicity here per spec.
    if (process.env.NODE_ENV === 'test') return;
    this.staleScanTimer = setInterval(() => {
      this.expireStaleReservations().catch((err: unknown) => {
        const m = err instanceof Error ? err.message : String(err);
        this.logger.warn(`expireStaleReservations failed: ${m}`);
      });
    }, STALE_RESERVATION_SCAN_INTERVAL_MS);
    this.staleScanTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.staleScanTimer) clearInterval(this.staleScanTimer);
  }

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  async ensureWallet(
    userId: string,
    currency: Currency = Currency.USD,
    kind: WalletKind = WalletKind.MAIN,
  ): Promise<Wallet> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.walletRepo.lockOrCreate(tx as PrismaTx, userId, currency, kind);
      const full = await tx.wallet.findUnique({ where: { id: row.id } });
      if (!full) throw new WalletNotFoundError(userId, currency);
      return full;
    });
  }

  async getWallet(
    userId: string,
    currency: Currency = Currency.USD,
    kind: WalletKind = WalletKind.MAIN,
  ): Promise<WalletView | null> {
    const w = await this.prisma.wallet.findUnique({
      where: { userId_currency_kind: { userId, currency, kind } },
    });
    return w
      ? {
          id: w.id,
          userId: w.userId,
          currency: w.currency,
          kind: w.kind,
          availableUnits: w.availableUnits,
          reservedUnits: w.reservedUnits,
          version: w.version,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        }
      : null;
  }

  async getBalances(userId: string, currency: Currency = Currency.USD): Promise<BalanceView> {
    const [main, bonus] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: {
          userId_currency_kind: { userId, currency, kind: WalletKind.MAIN },
        },
      }),
      this.prisma.wallet.findUnique({
        where: {
          userId_currency_kind: { userId, currency, kind: WalletKind.BONUS },
        },
      }),
    ]);
    const available = main?.availableUnits ?? 0n;
    const reserved = main?.reservedUnits ?? 0n;
    const bonusAvailable = bonus?.availableUnits ?? 0n;
    return {
      available,
      reserved,
      total: available + reserved,
      bonusAvailable,
      currency,
    };
  }

  async listTransactions(
    userId: string,
    filter: {
      type?: TransactionType;
      from?: Date;
      to?: Date;
      page?: number;
      pageSize?: number;
    },
  ): Promise<Paginated<TransactionView>> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.TransactionWhereInput = { userId };
    if (filter.type) where.type = filter.type;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    return this.transactionRepo.list(this.prisma as PrismaTx, where, page, pageSize);
  }

  async getTransaction(userId: string, id: string): Promise<TransactionView | null> {
    const t = await this.prisma.transaction.findFirst({ where: { id, userId } });
    return t ? this.transactionRepo.toView(t) : null;
  }

  // Admin-wide listing
  async adminListTransactions(filter: {
    userId?: string;
    type?: TransactionType;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<TransactionView>> {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
    const where: Prisma.TransactionWhereInput = {};
    if (filter.userId) where.userId = filter.userId;
    if (filter.type) where.type = filter.type;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    return this.transactionRepo.list(this.prisma as PrismaTx, where, page, pageSize);
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  async credit(input: CreditInput): Promise<Transaction> {
    if (input.amountUnits <= 0n) {
      throw new Error('credit: amountUnits must be positive (use correct() for negatives)');
    }
    const currency = input.currency ?? Currency.USD;
    const type = input.type ?? TransactionType.DEPOSIT;
    const scope = input.idempotencyScope ?? SCOPE.CREDIT;
    const key = input.idempotencyKey ?? `${type}:${randomUUID()}`;

    return this.runInTx(input.tx, async (tx) =>
      this.idempotency.run<Transaction>(
        scope,
        key,
        async (innerTx) => {
          const wallet = await this.walletRepo.lockOrCreate(
            innerTx,
            input.userId,
            currency,
            WalletKind.MAIN,
          );
          const newAvailable = wallet.availableUnits + input.amountUnits;
          await this.walletRepo.update(
            innerTx,
            wallet.id,
            wallet.version,
            newAvailable,
            wallet.reservedUnits,
          );
          return this.transactionRepo.insert(innerTx, {
            walletId: wallet.id,
            userId: input.userId,
            type,
            currency,
            amountUnits: input.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: wallet.reservedUnits,
            depositId: input.depositId ?? null,
            parentTransactionId: input.parentTransactionId ?? null,
            taskId: input.taskId ?? null,
            bundleKey: input.bundleKey ?? null,
            adminId: input.adminId ?? null,
            description: input.description ?? input.reason ?? null,
            metadata: this.buildMetadata(input.metadata, input.reason),
            idempotencyKey: key,
            idempotencyScope: scope,
          });
        },
        { tx },
      ),
    );
  }

  async debit(input: DebitInput): Promise<Transaction> {
    if (input.amountUnits <= 0n) {
      throw new Error('debit: amountUnits must be positive');
    }
    const currency = input.currency ?? Currency.USD;
    const scope = input.idempotencyScope ?? SCOPE.DEBIT;
    const key = input.idempotencyKey ?? `DEBIT:${randomUUID()}`;

    return this.runInTx(input.tx, async (tx) =>
      this.idempotency.run<Transaction>(
        scope,
        key,
        async (innerTx) => {
          const wallet = await this.walletRepo.lockOrCreate(
            innerTx,
            input.userId,
            currency,
            WalletKind.MAIN,
          );
          if (wallet.availableUnits < input.amountUnits) {
            throw new InsufficientBalanceError(
              input.amountUnits,
              wallet.availableUnits,
              currency,
            );
          }
          const newAvailable = wallet.availableUnits - input.amountUnits;
          await this.walletRepo.update(
            innerTx,
            wallet.id,
            wallet.version,
            newAvailable,
            wallet.reservedUnits,
          );
          return this.transactionRepo.insert(innerTx, {
            walletId: wallet.id,
            userId: input.userId,
            type: TransactionType.DEBIT,
            currency,
            amountUnits: -input.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: wallet.reservedUnits,
            taskId: input.taskId ?? null,
            bundleKey: input.bundleKey ?? null,
            adminId: input.adminId ?? null,
            description: input.description ?? input.reason ?? null,
            metadata: this.buildMetadata(input.metadata, input.reason),
            idempotencyKey: key,
            idempotencyScope: scope,
          });
        },
        { tx },
      ),
    );
  }

  async correct(input: CorrectInput): Promise<Transaction> {
    if (input.amountUnits === 0n) {
      throw new Error('correct: amountUnits must be non-zero');
    }
    const currency = input.currency ?? Currency.USD;
    const allowNegative = input.allowNegative ?? true;
    const scope = input.idempotencyScope ?? SCOPE.CORRECT;
    const key = input.idempotencyKey ?? `CORRECT:${randomUUID()}`;

    return this.runInTx(input.tx, async (tx) =>
      this.idempotency.run<Transaction>(
        scope,
        key,
        async (innerTx) => {
          const wallet = await this.walletRepo.lockOrCreate(
            innerTx,
            input.userId,
            currency,
            WalletKind.MAIN,
          );
          const newAvailable = wallet.availableUnits + input.amountUnits;
          if (!allowNegative && newAvailable < 0n) {
            throw new InsufficientBalanceError(
              -input.amountUnits,
              wallet.availableUnits,
              currency,
            );
          }
          await this.walletRepo.update(
            innerTx,
            wallet.id,
            wallet.version,
            newAvailable,
            wallet.reservedUnits,
          );
          return this.transactionRepo.insert(innerTx, {
            walletId: wallet.id,
            userId: input.userId,
            type: TransactionType.CORRECTION,
            currency,
            amountUnits: input.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: wallet.reservedUnits,
            adminId: input.adminId ?? null,
            description: input.description ?? input.reason ?? null,
            metadata: this.buildMetadata(input.metadata, input.reason),
            idempotencyKey: key,
            idempotencyScope: scope,
          });
        },
        { tx },
      ),
    );
  }

  async grantBonus(input: BonusInput): Promise<Transaction> {
    if (input.amountUnits <= 0n) {
      throw new Error('grantBonus: amountUnits must be positive');
    }
    const currency = input.currency ?? Currency.USD;
    const scope = SCOPE.BONUS;
    const key = input.idempotencyKey ?? `BONUS:${randomUUID()}`;

    return this.runInTx(input.tx, async (tx) =>
      this.idempotency.run<Transaction>(
        scope,
        key,
        async (innerTx) => {
          const wallet = await this.walletRepo.lockOrCreate(
            innerTx,
            input.userId,
            currency,
            WalletKind.BONUS,
          );
          const newAvailable = wallet.availableUnits + input.amountUnits;
          await this.walletRepo.update(
            innerTx,
            wallet.id,
            wallet.version,
            newAvailable,
            wallet.reservedUnits,
          );
          return this.transactionRepo.insert(innerTx, {
            walletId: wallet.id,
            userId: input.userId,
            type: TransactionType.BONUS_GRANT,
            currency,
            amountUnits: input.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: wallet.reservedUnits,
            adminId: input.adminId ?? null,
            description: input.description ?? input.reason ?? null,
            metadata: this.buildMetadata(input.metadata, input.reason),
            idempotencyKey: key,
            idempotencyScope: scope,
          });
        },
        { tx },
      ),
    );
  }

  async reserve(input: ReserveInput): Promise<Reservation> {
    if (input.amountUnits <= 0n) {
      throw new Error('reserve: amountUnits must be positive');
    }
    const currency = input.currency ?? Currency.USD;
    const scope = SCOPE.RESERVE;
    const key = input.idempotencyKey;
    const expiresAt = input.expiresAt ?? new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS);

    // Idempotency: a successful reserve returns the (now-existing) Reservation.
    return this.runInTx(input.tx, async (tx) => {
      // Short-circuit replay if the reservation row already exists for this idempotencyKey.
      const existing = await this.reservationRepo.findByIdempotencyKey(tx, key);
      if (existing) return existing;

      return this.idempotency.run<Reservation>(
        scope,
        key,
        async (innerTx) => {
          const wallet = await this.walletRepo.lockOrCreate(
            innerTx,
            input.userId,
            currency,
            WalletKind.MAIN,
          );
          if (wallet.availableUnits < input.amountUnits) {
            throw new InsufficientBalanceError(
              input.amountUnits,
              wallet.availableUnits,
              currency,
            );
          }
          const newAvailable = wallet.availableUnits - input.amountUnits;
          const newReserved = wallet.reservedUnits + input.amountUnits;
          await this.walletRepo.update(
            innerTx,
            wallet.id,
            wallet.version,
            newAvailable,
            newReserved,
          );
          const reservation = await this.reservationRepo.create(innerTx, {
            userId: input.userId,
            walletId: wallet.id,
            currency,
            amountUnits: input.amountUnits,
            expiresAt,
            idempotencyKey: key,
            taskId: input.taskId ?? null,
            bundleKey: input.bundleKey ?? null,
            pricingSnapshotId: input.pricingSnapshotId ?? null,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
          });
          await this.transactionRepo.insert(innerTx, {
            walletId: wallet.id,
            userId: input.userId,
            type: TransactionType.RESERVATION_HOLD,
            currency,
            amountUnits: -input.amountUnits,
            balanceAfterUnits: newAvailable,
            reservedAfterUnits: newReserved,
            reservationId: reservation.id,
            taskId: input.taskId ?? null,
            bundleKey: input.bundleKey ?? null,
            pricingSnapshotId: input.pricingSnapshotId ?? null,
            description: 'Reservation hold',
            metadata: this.buildMetadata(input.metadata),
            idempotencyKey: key,
            idempotencyScope: scope,
          });
          return reservation;
        },
        { tx },
      );
    });
  }

  async capture(
    reservationId: string,
    captureUnits: bigint,
    idempotencyKey: string,
    adminId?: string,
  ): Promise<CaptureResult> {
    if (captureUnits < 0n) {
      throw new Error('capture: captureUnits must be non-negative');
    }
    const scope = SCOPE.CAPTURE;
    return this.prisma.$transaction(
      async (tx) =>
        this.idempotency.run<CaptureResult>(
          scope,
          idempotencyKey,
          async (innerTx) => {
            const reservation = await this.reservationRepo.findById(innerTx, reservationId);
            if (!reservation) throw new ReservationNotFoundError(reservationId);
            if (reservation.status !== ReservationStatus.PENDING) {
              throw new ReservationStateError(
                reservationId,
                reservation.status,
                'capture',
              );
            }
            if (captureUnits > reservation.amountUnits) {
              throw new Error(
                `capture: captureUnits (${captureUnits}) exceeds reservation amount (${reservation.amountUnits})`,
              );
            }
            const wallet = await this.walletRepo.lockOrCreate(
              innerTx,
              reservation.userId,
              reservation.currency,
              WalletKind.MAIN,
            );
            const refundUnits = reservation.amountUnits - captureUnits;
            const newReserved = wallet.reservedUnits - reservation.amountUnits;
            const newAvailable = wallet.availableUnits + refundUnits;
            await this.walletRepo.update(
              innerTx,
              wallet.id,
              wallet.version,
              newAvailable,
              newReserved,
            );
            const updatedReservation = await this.reservationRepo.markCaptured(
              innerTx,
              reservationId,
              captureUnits,
            );
            const txn = await this.transactionRepo.insert(innerTx, {
              walletId: wallet.id,
              userId: reservation.userId,
              type: TransactionType.RESERVATION_CAPTURE,
              currency: reservation.currency,
              amountUnits: -captureUnits,
              balanceAfterUnits: newAvailable,
              reservedAfterUnits: newReserved,
              reservationId,
              taskId: reservation.taskId,
              bundleKey: reservation.bundleKey,
              pricingSnapshotId: reservation.pricingSnapshotId,
              adminId: adminId ?? null,
              description: 'Reservation capture',
              idempotencyKey,
              idempotencyScope: scope,
            });
            return { reservation: updatedReservation, transaction: txn };
          },
          { tx: tx as PrismaTx },
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async release(
    reservationId: string,
    idempotencyKey: string,
    adminId?: string,
  ): Promise<ReleaseResult> {
    const scope = SCOPE.RELEASE;
    return this.prisma.$transaction(
      async (tx) =>
        this.idempotency.run<ReleaseResult>(
          scope,
          idempotencyKey,
          async (innerTx) => {
            const reservation = await this.reservationRepo.findById(innerTx, reservationId);
            if (!reservation) throw new ReservationNotFoundError(reservationId);
            if (reservation.status !== ReservationStatus.PENDING) {
              throw new ReservationStateError(
                reservationId,
                reservation.status,
                'release',
              );
            }
            const wallet = await this.walletRepo.lockOrCreate(
              innerTx,
              reservation.userId,
              reservation.currency,
              WalletKind.MAIN,
            );
            const newReserved = wallet.reservedUnits - reservation.amountUnits;
            const newAvailable = wallet.availableUnits + reservation.amountUnits;
            await this.walletRepo.update(
              innerTx,
              wallet.id,
              wallet.version,
              newAvailable,
              newReserved,
            );
            const updatedReservation = await this.reservationRepo.markReleased(
              innerTx,
              reservationId,
            );
            const txn = await this.transactionRepo.insert(innerTx, {
              walletId: wallet.id,
              userId: reservation.userId,
              type: TransactionType.RESERVATION_RELEASE,
              currency: reservation.currency,
              amountUnits: reservation.amountUnits,
              balanceAfterUnits: newAvailable,
              reservedAfterUnits: newReserved,
              reservationId,
              taskId: reservation.taskId,
              bundleKey: reservation.bundleKey,
              pricingSnapshotId: reservation.pricingSnapshotId,
              adminId: adminId ?? null,
              description: 'Reservation release',
              idempotencyKey,
              idempotencyScope: scope,
            });
            return { reservation: updatedReservation, transaction: txn };
          },
          { tx: tx as PrismaTx },
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Find PENDING reservations whose `expiresAt` has passed and release them.
   * Returns the count of expired reservations.
   */
  async expireStaleReservations(): Promise<number> {
    const stale = await this.prisma.reservation.findMany({
      where: { status: ReservationStatus.PENDING, expiresAt: { lt: new Date() } },
      take: 100,
      orderBy: { expiresAt: 'asc' },
      select: { id: true },
    });
    let count = 0;
    for (const r of stale) {
      try {
        await this.expireOne(r.id);
        count++;
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        this.logger.warn(`failed to expire reservation ${r.id}: ${m}`);
      }
    }
    return count;
  }

  private async expireOne(reservationId: string): Promise<void> {
    const idempotencyKey = `expire:${reservationId}`;
    await this.prisma.$transaction(
      async (tx) =>
        this.idempotency.run<{ ok: true }>(
          SCOPE.EXPIRE,
          idempotencyKey,
          async (innerTx) => {
            const reservation = await this.reservationRepo.findById(innerTx, reservationId);
            if (!reservation || reservation.status !== ReservationStatus.PENDING) {
              return { ok: true };
            }
            const wallet = await this.walletRepo.lockOrCreate(
              innerTx,
              reservation.userId,
              reservation.currency,
              WalletKind.MAIN,
            );
            const newReserved = wallet.reservedUnits - reservation.amountUnits;
            const newAvailable = wallet.availableUnits + reservation.amountUnits;
            await this.walletRepo.update(
              innerTx,
              wallet.id,
              wallet.version,
              newAvailable,
              newReserved,
            );
            await this.reservationRepo.markExpired(innerTx, reservationId);
            await this.transactionRepo.insert(innerTx, {
              walletId: wallet.id,
              userId: reservation.userId,
              type: TransactionType.RESERVATION_RELEASE,
              currency: reservation.currency,
              amountUnits: reservation.amountUnits,
              balanceAfterUnits: newAvailable,
              reservedAfterUnits: newReserved,
              reservationId,
              taskId: reservation.taskId,
              bundleKey: reservation.bundleKey,
              pricingSnapshotId: reservation.pricingSnapshotId,
              description: 'Reservation expired',
              idempotencyKey,
              idempotencyScope: SCOPE.EXPIRE,
            });
            return { ok: true };
          },
          { tx: tx as PrismaTx },
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async runInTx<T>(
    existing: PrismaTx | undefined,
    fn: (tx: PrismaTx) => Promise<T>,
  ): Promise<T> {
    if (existing) return fn(existing);
    return this.prisma.$transaction(async (tx) => fn(tx as PrismaTx), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private buildMetadata(
    metadata?: Record<string, unknown>,
    reason?: string,
  ): Prisma.InputJsonValue | undefined {
    if (!metadata && !reason) return undefined;
    const out: Record<string, unknown> = { ...(metadata ?? {}) };
    if (reason && !('reason' in out)) out.reason = reason;
    return out as Prisma.InputJsonValue;
  }
}
