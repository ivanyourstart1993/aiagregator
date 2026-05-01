/**
 * Sanitises terminal Task error codes/messages before returning them to
 * external API consumers (REST GET /v1/tasks/* and outgoing webhooks).
 *
 * Internal failure modes leak operational state and would force us to
 * maintain a stable contract for every adapter quirk. They also signal to
 * attackers which provider accounts are compromised, so we never expose
 * raw internal codes.
 *
 * However, a flat `service_unavailable` catch-all is hostile to clients —
 * they can't tell "transient outage, retry in 30s" apart from "you need
 * to call support". So we do a small amount of bucketing: groups of
 * internal codes map to a stable, public-safe code that signals the
 * shape of the problem (transient vs operator-action-required) without
 * disclosing infra detail.
 *
 * The original code/message stay in Task.errorCode/ApiRequest.errorCode
 * in the DB so admin surfaces still see the diagnostic.
 */

// Internal codes that the *caller* caused — passed through verbatim.
const USER_CAUSED_CODES: ReadonlySet<string> = new Set([
  // Caller's prompt/params were structurally invalid
  'invalid_parameter',
  'invalid_parameters',
  'invalid_request',
  // Provider's own safety filter rejected the input
  'content_rejected',
]);

// Public-facing error code constants returned to API consumers.
export const SANITIZED_FALLBACK_CODE = 'service_unavailable';
export const SANITIZED_FALLBACK_MESSAGE =
  'The service is temporarily unavailable. Please retry shortly.';

const PROVIDER_OUTAGE_CODE = 'provider_outage';
const PROVIDER_OUTAGE_MESSAGE =
  'No provider capacity is available for this method right now. Please retry shortly.';

const PROVIDER_REJECTED_CODE = 'provider_rejected';
const PROVIDER_REJECTED_MESSAGE =
  'The provider rejected this request. Check parameters and retry, or contact support if it persists.';

// Internal-code → public-code buckets. Anything not listed here falls
// through to SANITIZED_FALLBACK_CODE (service_unavailable).
const PROVIDER_OUTAGE_INTERNAL: ReadonlySet<string> = new Set([
  // Worker preflight: no eligible account in the pool. Operator action
  // required (warmup/quota/proxy), but from the caller's POV it looks
  // exactly like a transient outage of the method.
  'no_available_provider_account',
  'no_active_account',
  'no_healthy_account',
  // All eligible accounts are rate-limited or quota-exhausted right now.
  'provider_quota_exhausted',
  'provider_billing_error',
  // Proxy layer down for the selected account.
  'proxy_unavailable',
  // Provider's own 5xx / network errors bubbled through the adapter.
  'provider_temporary',
  'temporary',
  'rate_limit',
]);

const PROVIDER_REJECTED_INTERNAL: ReadonlySet<string> = new Set([
  // The adapter sent a structurally invalid request to the provider —
  // usually means our params translation is off for an edge case.
  // Exposing this as `provider_rejected` lets the caller know it's
  // worth changing inputs (instead of blindly retrying).
  'validation',
  'provider_validation',
]);

export interface SanitizedError {
  code: string | null;
  message: string | null;
}

export function sanitizeTaskError(
  code: string | null | undefined,
  message: string | null | undefined,
): SanitizedError {
  if (!code) return { code: null, message: null };
  if (USER_CAUSED_CODES.has(code)) {
    return { code, message: message ?? null };
  }
  if (PROVIDER_OUTAGE_INTERNAL.has(code)) {
    return { code: PROVIDER_OUTAGE_CODE, message: PROVIDER_OUTAGE_MESSAGE };
  }
  if (PROVIDER_REJECTED_INTERNAL.has(code)) {
    return { code: PROVIDER_REJECTED_CODE, message: PROVIDER_REJECTED_MESSAGE };
  }
  return {
    code: SANITIZED_FALLBACK_CODE,
    message: SANITIZED_FALLBACK_MESSAGE,
  };
}
