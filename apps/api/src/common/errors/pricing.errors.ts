/**
 * Domain-level pricing exceptions. Translated to public errors by `PublicErrorFilter`.
 */

export class PriceNotConfiguredError extends Error {
  constructor(public readonly bundleKey: string) {
    super(`Price not configured for bundle ${bundleKey}`);
    this.name = 'PriceNotConfiguredError';
  }
}

export class TariffNotFoundError extends Error {
  constructor(public readonly tariffId: string) {
    super(`Tariff not found: ${tariffId}`);
    this.name = 'TariffNotFoundError';
  }
}

export class DefaultTariffMissingError extends Error {
  constructor() {
    super('No default tariff is configured');
    this.name = 'DefaultTariffMissingError';
  }
}

export class TariffInUseError extends Error {
  constructor(
    public readonly tariffId: string,
    public readonly reason: string,
  ) {
    super(`Tariff ${tariffId} cannot be deleted: ${reason}`);
    this.name = 'TariffInUseError';
  }
}

export class BundlePriceNotFoundError extends Error {
  constructor(
    public readonly tariffId: string,
    public readonly bundleId: string,
  ) {
    super(`Bundle price not found for tariff=${tariffId} bundle=${bundleId}`);
    this.name = 'BundlePriceNotFoundError';
  }
}

export class UserBundlePriceNotFoundError extends Error {
  constructor(
    public readonly userId: string,
    public readonly bundleId: string,
  ) {
    super(`User bundle price not found for user=${userId} bundle=${bundleId}`);
    this.name = 'UserBundlePriceNotFoundError';
  }
}

export class BundleNotFoundError extends Error {
  constructor(public readonly idOrKey: string) {
    super(`Bundle not found: ${idOrKey}`);
    this.name = 'BundleNotFoundError';
  }
}
