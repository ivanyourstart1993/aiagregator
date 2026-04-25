/**
 * Domain-level billing exceptions. These are thrown by services and translated
 * to public errors by `PublicErrorFilter`.
 */

import type { Currency } from '@aiagg/shared';

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly requiredUnits: bigint,
    public readonly availableUnits: bigint,
    public readonly currency: Currency = 'USD',
  ) {
    super(
      `Insufficient ${currency} balance: required ${requiredUnits.toString()} units, available ${availableUnits.toString()} units`,
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly expected: Currency,
    public readonly actual: Currency,
  ) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class WalletNotFoundError extends Error {
  constructor(
    public readonly userId: string,
    public readonly currency: Currency = 'USD',
  ) {
    super(`Wallet not found for user=${userId} currency=${currency}`);
    this.name = 'WalletNotFoundError';
  }
}

export class ReservationNotFoundError extends Error {
  constructor(public readonly reservationId: string) {
    super(`Reservation not found: ${reservationId}`);
    this.name = 'ReservationNotFoundError';
  }
}

export class ReservationStateError extends Error {
  constructor(
    public readonly reservationId: string,
    public readonly currentStatus: string,
    public readonly attemptedAction: string,
  ) {
    super(
      `Reservation ${reservationId} is in status ${currentStatus}, cannot ${attemptedAction}`,
    );
    this.name = 'ReservationStateError';
  }
}
