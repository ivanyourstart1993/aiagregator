/**
 * Shared transformer for class-validator/class-transformer that accepts BigInt-like
 * inputs (decimal-integer strings, numbers, bigints) and outputs `bigint | undefined`.
 */
export function toOptionalBigInt({ value }: { value: unknown }): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Expected integer, got non-integer number: ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value)) {
      throw new TypeError(`Expected decimal-integer string, got ${JSON.stringify(value)}`);
    }
    return BigInt(value);
  }
  throw new TypeError(`Unsupported BigInt input type: ${typeof value}`);
}

export function toRequiredBigInt(input: { value: unknown }): bigint {
  const out = toOptionalBigInt(input);
  if (out === undefined) {
    throw new TypeError('BigInt value is required');
  }
  return out;
}
