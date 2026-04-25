import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode } from '@aiagg/shared';
import type { Request, Response } from 'express';
import { getRequestId } from '../middleware/request-id.middleware';
import {
  CurrencyMismatchError,
  InsufficientBalanceError,
  ReservationNotFoundError,
  ReservationStateError,
  WalletNotFoundError,
} from '../errors/billing.errors';
import {
  BundleNotFoundError,
  BundlePriceNotFoundError,
  DefaultTariffMissingError,
  PriceNotConfiguredError,
  TariffInUseError,
  TariffNotFoundError,
  UserBundlePriceNotFoundError,
} from '../errors/pricing.errors';
import {
  CouponAlreadyUsedError,
  CouponExpiredError,
  CouponInvalidError,
  CouponNotApplicableError,
} from '../errors/coupon.errors';
import {
  CatalogEntityInUseError,
  CatalogEntityNotFoundError,
  InvalidParametersError,
  InvalidParametersSchemaError,
  MethodNotAvailableForUserError,
  UnsupportedMethodError,
  UnsupportedModelError,
  UnsupportedProviderError,
} from '../errors/catalog.errors';
import {
  IdempotencyKeyInUseError,
  IdempotencyKeyMismatchError,
  InvalidApiKeyError,
  RateLimitExceededError,
  TaskNotFoundError,
  TaskNotOwnedError,
  TaskResultNotReadyError,
  UserBlockedError,
} from '../errors/public-api.errors';

export interface PublicErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

interface InternalErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.INVALID_API_KEY,
  [HttpStatus.FORBIDDEN]: ErrorCode.USER_BLOCKED,
  [HttpStatus.NOT_FOUND]: ErrorCode.TASK_NOT_FOUND,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.INVALID_REQUEST,
  [HttpStatus.BAD_REQUEST]: ErrorCode.INVALID_REQUEST,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function stripInternalKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_internal_')) continue;
    out[k] = v;
  }
  return out;
}

function fromHttpException(e: HttpException): InternalErrorShape {
  const status = e.getStatus();
  const response = e.getResponse();

  let message = e.message || 'Request failed';
  let details: Record<string, unknown> | undefined;
  let code: string = STATUS_TO_CODE[status] ?? ErrorCode.INVALID_REQUEST;

  if (typeof response === 'string') {
    message = response;
  } else if (isRecord(response)) {
    if (typeof response.message === 'string') {
      message = response.message;
    } else if (Array.isArray(response.message)) {
      message = 'Validation failed';
      details = { issues: response.message };
      code = ErrorCode.INVALID_PARAMETERS;
    }
    if (typeof response.code === 'string') {
      code = response.code;
    }
    if (isRecord(response.details)) {
      details = stripInternalKeys(response.details);
    }
  }

  return { code, message, details };
}

interface MappedDomainError {
  status: number;
  shape: InternalErrorShape;
}

function fromDomainError(e: Error): MappedDomainError | undefined {
  if (e instanceof InsufficientBalanceError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INSUFFICIENT_BALANCE,
        message: 'Wallet balance is below required amount.',
        details: {
          requiredUnits: e.requiredUnits.toString(),
          availableUnits: e.availableUnits.toString(),
          currency: e.currency,
        },
      },
    };
  }
  if (e instanceof CurrencyMismatchError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Currency mismatch.',
        details: { expected: e.expected, actual: e.actual },
      },
    };
  }
  if (e instanceof WalletNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Wallet not found.',
      },
    };
  }
  if (e instanceof ReservationNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Reservation not found.',
      },
    };
  }
  if (e instanceof PriceNotConfiguredError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.PRICE_NOT_CONFIGURED,
        message: 'Pricing is not configured for this bundle.',
        details: { bundleKey: e.bundleKey },
      },
    };
  }
  if (e instanceof TariffNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Tariff not found.',
        details: { tariffId: e.tariffId },
      },
    };
  }
  if (e instanceof DefaultTariffMissingError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.PRICE_NOT_CONFIGURED,
        message: 'Default tariff is not configured.',
      },
    };
  }
  if (e instanceof TariffInUseError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Tariff cannot be deleted while in use.',
        details: { tariffId: e.tariffId, reason: e.reason },
      },
    };
  }
  if (e instanceof BundlePriceNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Bundle price not found.',
        details: { tariffId: e.tariffId, bundleId: e.bundleId },
      },
    };
  }
  if (e instanceof UserBundlePriceNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'User bundle price not found.',
        details: { userId: e.userId, bundleId: e.bundleId },
      },
    };
  }
  if (e instanceof BundleNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Bundle not found.',
        details: { idOrKey: e.idOrKey },
      },
    };
  }
  if (e instanceof CouponInvalidError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.COUPON_INVALID,
        message: 'Coupon is invalid.',
        details: { code: e.code, reason: e.reason },
      },
    };
  }
  if (e instanceof CouponExpiredError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.COUPON_EXPIRED,
        message: 'Coupon is expired.',
        details: { code: e.code },
      },
    };
  }
  if (e instanceof CouponAlreadyUsedError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.COUPON_ALREADY_USED,
        message: 'Coupon has already been used.',
        details: { code: e.code },
      },
    };
  }
  if (e instanceof CouponNotApplicableError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.COUPON_INVALID,
        message: 'Coupon is not applicable in this context.',
        details: { code: e.code, reason: e.reason },
      },
    };
  }
  if (e instanceof UnsupportedProviderError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.UNSUPPORTED_PROVIDER,
        message: 'Provider is not supported.',
        details: { provider: e.code },
      },
    };
  }
  if (e instanceof UnsupportedModelError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.UNSUPPORTED_MODEL,
        message: 'Model is not supported.',
        details: { model: e.code },
      },
    };
  }
  if (e instanceof UnsupportedMethodError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.UNSUPPORTED_METHOD,
        message: 'Method is not supported.',
        details: { method: e.code },
      },
    };
  }
  if (e instanceof MethodNotAvailableForUserError) {
    return {
      status: HttpStatus.FORBIDDEN,
      shape: {
        code: ErrorCode.METHOD_NOT_AVAILABLE_FOR_USER,
        message: 'Method is not available for this user.',
        details: { methodId: e.methodId },
      },
    };
  }
  if (e instanceof InvalidParametersError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INVALID_PARAMETERS,
        message: 'Request parameters failed validation.',
        details: { errors: e.errors },
      },
    };
  }
  if (e instanceof InvalidParametersSchemaError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INVALID_PARAMETERS,
        message: 'parametersSchema is not a valid JSON Schema.',
        details: { errors: e.errors },
      },
    };
  }
  if (e instanceof CatalogEntityNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: `${e.entity} not found.`,
        details: { entity: e.entity, id: e.id },
      },
    };
  }
  if (e instanceof CatalogEntityInUseError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: `${e.entity} cannot be deleted while in use.`,
        details: { entity: e.entity, id: e.id, reason: e.reason },
      },
    };
  }
  if (e instanceof InvalidApiKeyError) {
    return {
      status: HttpStatus.UNAUTHORIZED,
      shape: {
        code: ErrorCode.INVALID_API_KEY,
        message: 'Invalid or revoked API key.',
      },
    };
  }
  if (e instanceof UserBlockedError) {
    return {
      status: HttpStatus.FORBIDDEN,
      shape: {
        code: ErrorCode.USER_BLOCKED,
        message: 'User account is blocked.',
      },
    };
  }
  if (e instanceof RateLimitExceededError) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      shape: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded.',
        details: {
          limit: e.limit,
          windowSeconds: e.windowSeconds,
          retryAfterSeconds: e.retryAfterSeconds,
        },
      },
    };
  }
  if (e instanceof IdempotencyKeyInUseError) {
    return {
      status: HttpStatus.CONFLICT,
      shape: {
        code: ErrorCode.IDEMPOTENCY_KEY_IN_USE,
        message: 'Idempotency key is currently in use.',
        details: { key: e.key },
      },
    };
  }
  if (e instanceof IdempotencyKeyMismatchError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.IDEMPOTENCY_KEY_MISMATCH,
        message:
          'Idempotency key was previously used with a different request body.',
        details: { key: e.key },
      },
    };
  }
  if (e instanceof TaskNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      shape: {
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found.',
        details: { taskId: e.taskId },
      },
    };
  }
  if (e instanceof TaskNotOwnedError) {
    return {
      status: HttpStatus.NOT_FOUND, // do not leak existence
      shape: {
        code: ErrorCode.TASK_NOT_FOUND,
        message: 'Task not found.',
      },
    };
  }
  if (e instanceof TaskResultNotReadyError) {
    return {
      status: HttpStatus.CONFLICT,
      shape: {
        code: ErrorCode.TASK_FAILED,
        message: 'Task result is not yet available.',
        details: { taskId: e.taskId },
      },
    };
  }
  if (e instanceof ReservationStateError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      shape: {
        code: ErrorCode.INVALID_REQUEST,
        message: 'Reservation is in an invalid state for this operation.',
        details: {
          reservationId: e.reservationId,
          currentStatus: e.currentStatus,
          attemptedAction: e.attemptedAction,
        },
      },
    };
  }
  return undefined;
}

@Catch()
export class PublicErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(PublicErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = getRequestId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let shape: InternalErrorShape = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      shape = fromHttpException(exception);
    } else if (exception instanceof Error) {
      const mapped = fromDomainError(exception);
      if (mapped) {
        status = mapped.status;
        shape = mapped.shape;
      } else {
        this.logger.error(
          `Unhandled error on ${req.method} ${req.url}: ${exception.message}`,
          exception.stack,
        );
      }
    } else {
      this.logger.error(`Unhandled non-Error throw on ${req.method} ${req.url}`);
    }

    const envelope: PublicErrorEnvelope = {
      success: false,
      error: {
        code: shape.code,
        message: shape.message,
        ...(shape.details ? { details: shape.details } : {}),
        ...(requestId ? { request_id: requestId } : {}),
      },
    };

    res.status(status).json(envelope);
  }
}
