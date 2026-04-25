/**
 * Все денежные суммы хранятся в "нано-USD": 1 USD = 100_000_000 units (cents × 1_000_000).
 * Это даёт 6 знаков после цента — достаточно для per-second pricing с дробными центами
 * без потерь округления.
 *
 * Все операции — на BigInt. Никаких Number-арифметик над деньгами.
 */

export type Currency = 'USD';

export interface Money {
  readonly units: bigint;
  readonly currency: Currency;
}

export const NANO_PER_DOLLAR = 100_000_000n;
export const NANO_PER_CENT = 1_000_000n;
/** Used for safely scaling Number factors (3 decimals of precision). */
const MILLI_SCALE = 1000n;

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly left: Currency,
    public readonly right: Currency,
  ) {
    super(`Currency mismatch: ${left} vs ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function fromUnits(units: bigint, currency: Currency = 'USD'): Money {
  return { units, currency };
}

export function fromCents(cents: number | bigint, currency: Currency = 'USD'): Money {
  return { units: BigInt(cents) * NANO_PER_CENT, currency };
}

export function toCents(money: Money, mode: 'floor' | 'round' = 'round'): bigint {
  const { units } = money;
  if (mode === 'floor') {
    // BigInt division truncates toward zero; floor for negatives needs adjustment.
    if (units < 0n && units % NANO_PER_CENT !== 0n) {
      return units / NANO_PER_CENT - 1n;
    }
    return units / NANO_PER_CENT;
  }
  // round half-up
  const rem = units % NANO_PER_CENT;
  const half = NANO_PER_CENT / 2n;
  if (rem >= half) return units / NANO_PER_CENT + 1n;
  if (rem <= -half) return units / NANO_PER_CENT - 1n;
  return units / NANO_PER_CENT;
}

export function zero(currency: Currency = 'USD'): Money {
  return { units: 0n, currency };
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { units: a.units + b.units, currency: a.currency };
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { units: a.units - b.units, currency: a.currency };
}

/**
 * Multiply money by a factor.
 * - bigint: exact multiplication.
 * - number: scaled to 3 decimals (×1000) before multiplication; result rounded toward zero.
 *   Sufficient for percentages/discounts (e.g. 0.85 → 850 / 1000).
 *   For high-precision needs (basis points), prefer bigint factor: e.g. 8500n / 10000n.
 */
export function mul(money: Money, factor: bigint | number): Money {
  let units: bigint;
  if (typeof factor === 'bigint') {
    units = money.units * factor;
  } else {
    if (!Number.isFinite(factor)) {
      throw new TypeError(`mul: factor must be finite, got ${factor}`);
    }
    // Scale by 1000 to capture 3 decimals; round to nearest integer to avoid drift.
    const scaled = Math.round(factor * Number(MILLI_SCALE));
    units = (money.units * BigInt(scaled)) / MILLI_SCALE;
  }
  return { units, currency: money.currency };
}

export function negate(m: Money): Money {
  return { units: -m.units, currency: m.currency };
}

export function gte(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.units >= b.units;
}

export function lte(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.units <= b.units;
}

export function gt(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.units > b.units;
}

export function lt(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.units < b.units;
}

export function eq(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.units === b.units;
}

export function isPositive(m: Money): boolean {
  return m.units > 0n;
}

export function isNegative(m: Money): boolean {
  return m.units < 0n;
}

export function isZero(m: Money): boolean {
  return m.units === 0n;
}

/**
 * Format raw nano-USD units as a fixed-decimal string (default: 6 decimals).
 * Returns the canonical machine-readable form for public API (e.g. "12.345600").
 */
export function formatUnits(units: bigint, fractionDigits = 6): string {
  if (fractionDigits < 0 || fractionDigits > 8) {
    throw new RangeError(`fractionDigits out of range: ${fractionDigits}`);
  }
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / NANO_PER_DOLLAR;
  const fraction = abs % NANO_PER_DOLLAR;
  // Pad to 8 digits (NANO_PER_DOLLAR = 1e8) then trim/extend to fractionDigits.
  const fractionStr = fraction.toString().padStart(8, '0');
  let body: string;
  if (fractionDigits === 0) {
    body = `${whole.toString()}`;
  } else if (fractionDigits <= 8) {
    body = `${whole.toString()}.${fractionStr.slice(0, fractionDigits)}`;
  } else {
    body = `${whole.toString()}.${fractionStr}${'0'.repeat(fractionDigits - 8)}`;
  }
  return negative ? `-${body}` : body;
}

/**
 * Human-readable form for UI display (default: 2 decimals + currency).
 * Rounds half-up at the cent boundary so "0.005 USD" → "0.01 USD".
 */
export function formatDisplay(m: Money, fractionDigits = 2): string {
  if (fractionDigits === 2) {
    // Round to cents using half-up to keep display stable.
    const cents = toCents(m, 'round');
    const negative = cents < 0n;
    const abs = negative ? -cents : cents;
    const whole = abs / 100n;
    const frac = (abs % 100n).toString().padStart(2, '0');
    const body = `${whole.toString()}.${frac}`;
    return `${negative ? '-' : ''}${body} ${m.currency}`;
  }
  return `${formatUnits(m.units, fractionDigits)} ${m.currency}`;
}

/**
 * Parse a user-input amount string ("12.50", "12.345600", "-3.14") to Money.
 * Accepts up to 8 decimal places (full nano-USD precision). Anything beyond is rejected.
 * No locale-specific separators — strict "[-]?\d+(\.\d{0,8})?" form.
 */
export function parseAmountString(s: string, currency: Currency = 'USD'): Money {
  const trimmed = s.trim();
  if (!/^-?\d+(\.\d{1,8})?$/.test(trimmed)) {
    throw new TypeError(`Invalid amount string: ${JSON.stringify(s)}`);
  }
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = '0', fracPart = ''] = body.split('.');
  const fracPadded = (fracPart + '00000000').slice(0, 8);
  const whole = BigInt(wholePart);
  const fraction = BigInt(fracPadded);
  const units = whole * NANO_PER_DOLLAR + fraction;
  return { units: negative ? -units : units, currency };
}
