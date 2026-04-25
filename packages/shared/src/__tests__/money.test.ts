import { describe, expect, it } from 'vitest';
import {
  add,
  CurrencyMismatchError,
  eq,
  formatDisplay,
  formatUnits,
  fromCents,
  fromUnits,
  gt,
  gte,
  isNegative,
  isPositive,
  isZero,
  lt,
  lte,
  mul,
  NANO_PER_CENT,
  NANO_PER_DOLLAR,
  negate,
  parseAmountString,
  sub,
  toCents,
  zero,
} from '../money';

describe('fromCents/toCents', () => {
  it('converts cents to nano-USD and back (round mode)', () => {
    const m = fromCents(1234);
    expect(m.units).toBe(1234n * NANO_PER_CENT);
    expect(toCents(m)).toBe(1234n);
  });

  it('round mode performs half-up rounding', () => {
    expect(toCents(fromUnits(NANO_PER_CENT / 2n))).toBe(1n); // 0.005 → 1 cent
    expect(toCents(fromUnits(NANO_PER_CENT / 2n - 1n))).toBe(0n);
    expect(toCents(fromUnits(-(NANO_PER_CENT / 2n)))).toBe(-1n);
  });

  it('floor mode truncates toward -infinity', () => {
    expect(toCents(fromUnits(NANO_PER_CENT - 1n), 'floor')).toBe(0n);
    expect(toCents(fromUnits(-1n), 'floor')).toBe(-1n);
  });

  it('zero() returns 0n money', () => {
    expect(zero().units).toBe(0n);
    expect(zero().currency).toBe('USD');
  });
});

describe('add/sub same currency', () => {
  it('adds money values', () => {
    expect(add(fromCents(100), fromCents(50)).units).toBe(150n * NANO_PER_CENT);
  });

  it('subtracts money values', () => {
    expect(sub(fromCents(100), fromCents(30)).units).toBe(70n * NANO_PER_CENT);
  });

  it('handles big BigInt math without precision loss', () => {
    const big = fromUnits(10n ** 30n);
    const sum = add(big, big);
    expect(sum.units).toBe(2n * 10n ** 30n);
  });
});

describe('currency mismatch', () => {
  it('throws CurrencyMismatchError on add', () => {
    const a = fromCents(100);
    const b = { units: 50n, currency: 'EUR' as never };
    expect(() => add(a, b)).toThrow(CurrencyMismatchError);
  });

  it('throws on comparators', () => {
    const a = fromCents(100);
    const b = { units: 50n, currency: 'EUR' as never };
    expect(() => gte(a, b)).toThrow(CurrencyMismatchError);
    expect(() => eq(a, b)).toThrow(CurrencyMismatchError);
  });
});

describe('comparators', () => {
  const a = fromCents(100);
  const b = fromCents(200);
  const c = fromCents(100);

  it('gte/lte/gt/lt/eq', () => {
    expect(gt(b, a)).toBe(true);
    expect(gte(a, c)).toBe(true);
    expect(lt(a, b)).toBe(true);
    expect(lte(a, c)).toBe(true);
    expect(eq(a, c)).toBe(true);
    expect(eq(a, b)).toBe(false);
  });

  it('predicates', () => {
    expect(isPositive(a)).toBe(true);
    expect(isNegative(negate(a))).toBe(true);
    expect(isZero(zero())).toBe(true);
  });
});

describe('mul', () => {
  it('exact multiplication with bigint factor', () => {
    expect(mul(fromCents(100), 3n).units).toBe(3n * 100n * NANO_PER_CENT);
  });

  it('number factor scaled by 1000 then divided', () => {
    // 100 cents × 0.85 → 85 cents
    const m = mul(fromCents(100), 0.85);
    expect(m.units).toBe(85n * NANO_PER_CENT);
  });

  it('negative factor', () => {
    expect(mul(fromCents(100), -1n).units).toBe(-100n * NANO_PER_CENT);
  });

  it('rejects non-finite numbers', () => {
    expect(() => mul(fromCents(100), Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => mul(fromCents(100), Number.NaN)).toThrow(TypeError);
  });
});

describe('parseAmountString', () => {
  it('parses integer dollars', () => {
    expect(parseAmountString('12').units).toBe(12n * NANO_PER_DOLLAR);
  });

  it('parses 2 decimal cents', () => {
    expect(parseAmountString('12.50').units).toBe(1250n * NANO_PER_CENT);
  });

  it('parses up to 8 decimals (full nano)', () => {
    expect(parseAmountString('0.12345678').units).toBe(12345678n);
  });

  it('parses negative amounts', () => {
    expect(parseAmountString('-3.14').units).toBe(-314n * (NANO_PER_CENT * 1n));
  });

  it('rejects invalid strings', () => {
    expect(() => parseAmountString('12.345e1')).toThrow(TypeError);
    expect(() => parseAmountString('12.123456789')).toThrow(TypeError);
    expect(() => parseAmountString('abc')).toThrow(TypeError);
    expect(() => parseAmountString('')).toThrow(TypeError);
    expect(() => parseAmountString('12,50')).toThrow(TypeError);
  });

  it('handles whitespace via trim', () => {
    expect(parseAmountString(' 1.00 ').units).toBe(1n * NANO_PER_DOLLAR);
  });
});

describe('formatUnits', () => {
  it('default 6 decimals', () => {
    expect(formatUnits(NANO_PER_DOLLAR + NANO_PER_CENT * 50n)).toBe('1.500000');
  });

  it('zero decimals', () => {
    expect(formatUnits(NANO_PER_DOLLAR, 0)).toBe('1');
  });

  it('full 8 decimals', () => {
    expect(formatUnits(123456789n, 8)).toBe('1.23456789');
  });

  it('negative', () => {
    expect(formatUnits(-NANO_PER_DOLLAR, 2)).toBe('-1.00');
  });

  it('big numbers', () => {
    expect(formatUnits(10n ** 18n, 6)).toBe('10000000000.000000');
  });
});

describe('formatDisplay', () => {
  it('default 2 decimals + currency', () => {
    expect(formatDisplay(fromCents(1250))).toBe('12.50 USD');
  });

  it('rounds half-up at cent boundary', () => {
    // 0.005 USD = NANO_PER_CENT / 2 = 500_000 units
    expect(formatDisplay(fromUnits(NANO_PER_CENT / 2n))).toBe('0.01 USD');
  });

  it('handles negative', () => {
    expect(formatDisplay(fromCents(-1250))).toBe('-12.50 USD');
  });

  it('custom fractionDigits delegates to formatUnits', () => {
    expect(formatDisplay(fromUnits(123456n), 6)).toBe('0.001234 USD');
  });
});
