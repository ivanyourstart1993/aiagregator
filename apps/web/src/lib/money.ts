/**
 * Client-friendly money helpers.
 *
 * Backend returns nano-USD as strings: 1 USD = 100_000_000 units
 * (cents × 1_000_000). The internal API serialises with 6 fractional
 * digits (e.g. "12.345600" = 12.3456 USD = 1_234_560_000 nano-USD).
 *
 * We never do math on these as Number — we go through BigInt to avoid
 * losing precision. Display rounds to 2 decimals, half-up.
 */

const NANO_PER_DOLLAR = 100_000_000n; // 1 USD * 100 cents * 1e6 nano = 1e8 units
const NANO_PER_CENT = 1_000_000n;

function parseNano(nanoStr: string | null | undefined): bigint {
  // Defensive: API serialisation drift / missing fields used to crash
  // server components with `Cannot read properties of undefined (reading
  // 'trim')`. Treat absent/empty input as zero so a single bad row no
  // longer brings down a whole dashboard panel.
  if (nanoStr == null) return 0n;
  const s = String(nanoStr).trim();
  if (s === '') return 0n;
  // Accept either an integer string ("1230000") or a decimal string ("1.230000").
  // Internal API spec says decimal string with 6 fractional digits, but be lenient.
  if (/^-?\d+$/.test(s)) {
    return BigInt(s);
  }
  if (/^-?\d+\.\d+$/.test(s)) {
    const negative = s.startsWith('-');
    const body = negative ? s.slice(1) : s;
    const [whole = '0', frac = ''] = body.split('.');
    // 6 fractional digits means cents fractional. The "USD" decimal string with
    // 6 fractional digits represents cents-cents-cents (i.e. nano-USD when the
    // whole is in dollars). E.g. "12.345600" → 12 USD + 0.345600 USD = 12345600 nano.
    // We pad/trim to 8 digits because NANO_PER_DOLLAR = 1e8.
    const fracPadded = (frac + '00000000').slice(0, 8);
    const wholeUnits = BigInt(whole) * NANO_PER_DOLLAR;
    const fracUnits = BigInt(fracPadded);
    const total = wholeUnits + fracUnits;
    return negative ? -total : total;
  }
  throw new TypeError(`Invalid nano amount: ${JSON.stringify(nanoStr)}`);
}

function roundCentsHalfUp(nano: bigint): bigint {
  const negative = nano < 0n;
  const abs = negative ? -nano : nano;
  const rem = abs % NANO_PER_CENT;
  const half = NANO_PER_CENT / 2n;
  const floored = abs / NANO_PER_CENT;
  const rounded = rem >= half ? floored + 1n : floored;
  return negative ? -rounded : rounded;
}

/**
 * Format a nano-USD string for display.
 * Default 2 fractional digits (cents), rounded half-up.
 * Returns just the numeric string — not the currency.
 */
export function formatNanoToUSD(
  nanoStr: string | null | undefined,
  fractionDigits = 2,
): string {
  const units = parseNano(nanoStr);
  if (fractionDigits === 2) {
    const cents = roundCentsHalfUp(units);
    const negative = cents < 0n;
    const abs = negative ? -cents : cents;
    const whole = abs / 100n;
    const frac = (abs % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
  }
  // Generic path: divide by 1e8, render with given fractional digits.
  if (fractionDigits < 0 || fractionDigits > 8) {
    throw new RangeError(`fractionDigits out of range: ${fractionDigits}`);
  }
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / NANO_PER_DOLLAR;
  const frac = abs % NANO_PER_DOLLAR;
  const fracStr = frac.toString().padStart(8, '0');
  const body =
    fractionDigits === 0
      ? whole.toString()
      : `${whole.toString()}.${fracStr.slice(0, fractionDigits)}`;
  return negative ? `-${body}` : body;
}

/**
 * Convert a nano-USD string to integer cents (number).
 * Rounds half-up at the cent boundary.
 */
export function nanoToCents(nanoStr: string | null | undefined): number {
  const units = parseNano(nanoStr);
  const cents = roundCentsHalfUp(units);
  // Cents should fit in Number for any realistic balance (<$90,071,992,547,409.91).
  return Number(cents);
}

/** Convert dollars (Number, e.g. 12.5) to integer cents (Number). Half-up. */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new TypeError(`dollarsToCents: dollars must be finite, got ${dollars}`);
  }
  // Multiply by 100 and round half-away-from-zero to avoid 0.1 floating-point traps.
  const sign = dollars < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(dollars) * 100);
}

/**
 * Convenience: nano-USD string → "$12.34" with sign.
 * Use when you want a single string with the dollar sign.
 */
export function formatNanoUSDWithSign(
  nanoStr: string | null | undefined,
  fractionDigits = 2,
): string {
  const formatted = formatNanoToUSD(nanoStr, fractionDigits);
  if (formatted.startsWith('-')) return `-$${formatted.slice(1)}`;
  return `$${formatted}`;
}
