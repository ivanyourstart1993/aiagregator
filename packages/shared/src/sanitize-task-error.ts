/**
 * Sanitises terminal Task error codes/messages before returning them to
 * external API consumers (REST GET /v1/tasks/* and outgoing webhooks).
 *
 * Internal failure modes — broken provider accounts, dead proxies, missing
 * adapters, the worker's BullMQ retry exhaustion, etc. — leak operational
 * state and would force us to maintain a stable contract for every adapter
 * quirk. They also signal to attackers which provider accounts are
 * compromised. Whitelist only the codes that the *caller* caused; collapse
 * everything else to a generic `service_unavailable` so client retry logic
 * can do its job.
 *
 * The original code/message stay in Task.errorCode/ApiRequest.errorCode in
 * the DB so admin surfaces still see the diagnostic.
 */

const USER_CAUSED_CODES: ReadonlySet<string> = new Set([
  // Caller's prompt/params were structurally invalid
  'invalid_parameter',
  'invalid_parameters',
  'invalid_request',
  // Provider's own safety filter rejected the input
  'content_rejected',
]);

export const SANITIZED_FALLBACK_CODE = 'service_unavailable';
export const SANITIZED_FALLBACK_MESSAGE =
  'The service is temporarily unavailable. Please retry shortly.';

export function sanitizeTaskError(
  code: string | null | undefined,
  message: string | null | undefined,
): { code: string | null; message: string | null } {
  if (!code) return { code: null, message: null };
  if (USER_CAUSED_CODES.has(code)) {
    return { code, message: message ?? null };
  }
  return {
    code: SANITIZED_FALLBACK_CODE,
    message: SANITIZED_FALLBACK_MESSAGE,
  };
}
