/**
 * Stage 6 — Public /v1 API custom errors. Mapped to HTTP responses by
 * `PublicErrorFilter`. Keep error classes plain (no Nest exceptions) so they
 * can be thrown freely from services.
 */
export class InvalidApiKeyError extends Error {
  constructor(public readonly reason?: string) {
    super('Invalid or revoked API key.');
    this.name = 'InvalidApiKeyError';
  }
}

export class UserBlockedError extends Error {
  constructor(public readonly userId: string) {
    super('User account is blocked.');
    this.name = 'UserBlockedError';
  }
}

export class RateLimitExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly windowSeconds: number,
    public readonly retryAfterSeconds: number,
  ) {
    super('Rate limit exceeded.');
    this.name = 'RateLimitExceededError';
  }
}

export class IdempotencyKeyInUseError extends Error {
  constructor(public readonly key: string) {
    super('Idempotency key is currently in use.');
    this.name = 'IdempotencyKeyInUseError';
  }
}

export class IdempotencyKeyMismatchError extends Error {
  constructor(public readonly key: string) {
    super('Idempotency key was previously used with a different request body.');
    this.name = 'IdempotencyKeyMismatchError';
  }
}

export class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task ${taskId} not found.`);
    this.name = 'TaskNotFoundError';
  }
}

export class TaskNotOwnedError extends Error {
  constructor(public readonly taskId: string) {
    super('Task not owned by the requesting user.');
    this.name = 'TaskNotOwnedError';
  }
}

export class TaskResultNotReadyError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task ${taskId} result is not yet available.`);
    this.name = 'TaskResultNotReadyError';
  }
}

export class QueueOverloadedError extends Error {
  constructor(public readonly reason: string = 'queue_paused') {
    super('Generation queue is currently overloaded or paused.');
    this.name = 'QueueOverloadedError';
  }
}

export class ProviderPausedError extends Error {
  constructor(public readonly providerCode: string) {
    super(`Provider ${providerCode} is temporarily unavailable.`);
    this.name = 'ProviderPausedError';
  }
}

export class BundlePausedError extends Error {
  constructor(public readonly bundleKey: string) {
    super('This method is temporarily unavailable.');
    this.name = 'BundlePausedError';
  }
}
