export const ErrorCode = {
  // Auth & user
  INVALID_API_KEY: 'invalid_api_key',
  USER_BLOCKED: 'user_blocked',
  EMAIL_NOT_VERIFIED: 'email_not_verified',

  // Billing
  INSUFFICIENT_BALANCE: 'insufficient_balance',
  PRICE_NOT_CONFIGURED: 'price_not_configured',
  PROVIDER_RATE_CARD_NOT_CONFIGURED: 'provider_rate_card_not_configured',
  PROVIDER_COST_UNKNOWN: 'provider_cost_unknown',

  // Catalog
  UNSUPPORTED_PROVIDER: 'unsupported_provider',
  UNSUPPORTED_MODEL: 'unsupported_model',
  UNSUPPORTED_METHOD: 'unsupported_method',
  UNSUPPORTED_RESOLUTION: 'unsupported_resolution',
  UNSUPPORTED_DURATION: 'unsupported_duration',
  UNSUPPORTED_ASPECT_RATIO: 'unsupported_aspect_ratio',
  UNSUPPORTED_MODE: 'unsupported_mode',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  MODEL_UNAVAILABLE: 'model_unavailable',
  METHOD_UNAVAILABLE: 'method_unavailable',
  METHOD_NOT_AVAILABLE_FOR_USER: 'method_not_available_for_user',

  // Tasks
  TASK_NOT_FOUND: 'task_not_found',
  TASK_NOT_OWNED: 'task_not_owned',
  TASK_EXPIRED: 'task_expired',
  TASK_FAILED: 'task_failed',
  TASK_TIMED_OUT: 'task_timed_out',
  EXTERNAL_TASK_TIMEOUT: 'external_task_timeout',
  PROVIDER_RESULT_DOWNLOAD_FAILED: 'provider_result_download_failed',
  PROVIDER_NOT_IMPLEMENTED: 'provider_not_implemented',

  // Request
  INVALID_REQUEST: 'invalid_request',
  INVALID_PARAMETERS: 'invalid_parameters',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  QUEUE_OVERLOADED: 'queue_overloaded',

  // Idempotency
  IDEMPOTENCY_KEY_IN_USE: 'idempotency_key_in_use',
  IDEMPOTENCY_KEY_MISMATCH: 'idempotency_key_mismatch',

  // Coupons
  COUPON_INVALID: 'coupon_invalid',
  COUPON_EXPIRED: 'coupon_expired',
  COUPON_ALREADY_USED: 'coupon_already_used',

  // Callback
  CALLBACK_DELIVERY_FAILED: 'callback_delivery_failed',

  // Provider account (internal — public layer never exposes account names)
  PROVIDER_ACCOUNT_UNAVAILABLE: 'provider_account_unavailable',
  NO_AVAILABLE_PROVIDER_ACCOUNT: 'no_available_provider_account',
  PROVIDER_ACCOUNT_BILLING_ERROR: 'provider_account_billing_error',
  PROVIDER_ACCOUNT_QUOTA_EXHAUSTED: 'provider_account_quota_exhausted',
  PROVIDER_ACCOUNT_INVALID_CREDENTIALS: 'provider_account_invalid_credentials',
  PROVIDER_ACCOUNT_BLOCKED: 'provider_account_blocked',
  PROVIDER_ACCOUNT_LIMIT_REACHED: 'provider_account_limit_reached',
  PROVIDER_ACCOUNT_IN_COOLDOWN: 'provider_account_in_cooldown',
  PROVIDER_ACCOUNT_PROXY_UNAVAILABLE: 'provider_account_proxy_unavailable',

  // Proxy (internal)
  PROXY_CONNECTION_FAILED: 'proxy_connection_failed',
  PROXY_TIMEOUT: 'proxy_timeout',
  PROXY_AUTH_FAILED: 'proxy_auth_failed',
  PROXY_TLS_ERROR: 'proxy_tls_error',
  PROXY_UNAVAILABLE: 'proxy_unavailable',
  PROXY_RATE_LIMITED: 'proxy_rate_limited',

  // Generic
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
