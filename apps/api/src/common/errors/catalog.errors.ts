/**
 * Domain-level catalog exceptions. Translated to public errors by `PublicErrorFilter`.
 */

export class UnsupportedProviderError extends Error {
  constructor(public readonly code: string) {
    super(`Unsupported provider: ${code}`);
    this.name = 'UnsupportedProviderError';
  }
}

export class UnsupportedModelError extends Error {
  constructor(public readonly code: string) {
    super(`Unsupported model: ${code}`);
    this.name = 'UnsupportedModelError';
  }
}

export class UnsupportedMethodError extends Error {
  constructor(public readonly code: string) {
    super(`Unsupported method: ${code}`);
    this.name = 'UnsupportedMethodError';
  }
}

export class MethodNotAvailableForUserError extends Error {
  constructor(
    public readonly methodId: string,
    public readonly userId: string | null,
  ) {
    super(`Method ${methodId} is not available for user ${userId ?? '<anonymous>'}`);
    this.name = 'MethodNotAvailableForUserError';
  }
}

export class InvalidParametersError extends Error {
  constructor(public readonly errors: unknown[]) {
    super('Invalid parameters');
    this.name = 'InvalidParametersError';
  }
}

export class InvalidParametersSchemaError extends Error {
  constructor(public readonly errors: unknown[]) {
    super('Invalid parametersSchema');
    this.name = 'InvalidParametersSchemaError';
  }
}

export class CatalogEntityInUseError extends Error {
  constructor(
    public readonly entity: 'provider' | 'model' | 'method',
    public readonly id: string,
    public readonly reason: string,
  ) {
    super(`${entity} ${id} cannot be deleted: ${reason}`);
    this.name = 'CatalogEntityInUseError';
  }
}

export class CatalogEntityNotFoundError extends Error {
  constructor(
    public readonly entity: 'provider' | 'model' | 'method',
    public readonly id: string,
  ) {
    super(`${entity} not found: ${id}`);
    this.name = 'CatalogEntityNotFoundError';
  }
}
