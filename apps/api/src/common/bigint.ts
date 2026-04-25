/**
 * Global BigInt JSON serialization.
 *
 * Imported once early in main.ts. After this side-effect, every `JSON.stringify`
 * (which Express response.json calls under the hood) will serialise BigInt to a
 * decimal string, matching the public API contract for nano-USD amounts.
 */

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function toJSON(this: bigint): string {
      return this.toString();
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

export {};
