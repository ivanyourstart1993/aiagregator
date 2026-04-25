import type {
  Currency,
  TransactionStatus,
  TransactionType,
  WalletKind,
} from '@aiagg/db';

/**
 * BigInt fields are intentionally typed as `bigint` here. Global
 * `BigInt.prototype.toJSON` (registered in `common/bigint.ts`) takes care of
 * serialising them to decimal strings on the wire.
 */

export interface WalletView {
  id: string;
  userId: string;
  currency: Currency;
  kind: WalletKind;
  availableUnits: bigint;
  reservedUnits: bigint;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BalanceView {
  available: bigint;
  reserved: bigint;
  total: bigint;
  bonusAvailable: bigint;
  currency: Currency;
}

export interface TransactionView {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  currency: Currency;
  amountUnits: bigint;
  balanceAfterUnits: bigint;
  reservedAfterUnits: bigint;
  reservationId: string | null;
  depositId: string | null;
  parentTransactionId: string | null;
  taskId: string | null;
  bundleKey: string | null;
  pricingSnapshotId: string | null;
  adminId: string | null;
  description: string | null;
  metadata: unknown;
  idempotencyKey: string;
  idempotencyScope: string;
  createdAt: Date;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
